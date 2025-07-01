'use strict';

// Background script for managing tab-specific settings
// For more information on background script,
// See https://developer.chrome.com/extensions/background_pages

// 기존 탭에 Content Script 주입하는 함수
async function injectContentScriptToExistingTabs() {
  try {
    // 권한 확인
    const hasPermissions = await chrome.permissions.contains({
      permissions: ['scripting', 'tabs'],
      origins: ['*://x.com/*', '*://twitter.com/*']
    });

    if (!hasPermissions) {
      console.warn('Insufficient permissions for content script injection');
      return;
    }

    // X(트위터) 도메인 탭 찾기
    const tabs = await chrome.tabs.query({
      url: ['*://x.com/*', '*://twitter.com/*']
    });
    
    console.log(`Found ${tabs.length} existing X(Twitter) tabs for injection`);
    
    if (tabs.length === 0) {
      console.log('No X(Twitter) tabs found for injection');
      return;
    }

    // 각 탭에 대해 병렬로 주입 시도 (성능 향상)
    const injectionPromises = tabs.map(async (tab) => {
      try {
        // 탭이 완전히 로드되었는지 확인
        if (tab.status === 'complete' && !tab.discarded && tab.id) {
          console.log(`Checking content script in existing tab: ${tab.id} (${tab.url})`);
          
          // 먼저 이미 로드되어 있는지 확인
          try {
            await chrome.tabs.sendMessage(tab.id, { type: 'PING' });
            console.log(`Content script already exists in tab ${tab.id}`);
            return { tabId: tab.id, status: 'already_exists' };
          } catch (error) {
            // Content script가 없으므로 주입 진행
            console.log(`Injecting content script to existing tab: ${tab.id}`);
          }

          // Content Script 주입
          await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ['contentScript.js']
          });
          
          // 주입 후 충분한 대기 시간
          await new Promise(resolve => setTimeout(resolve, 2000));
          
          // 주입 성공 확인 후 탭 ID 업데이트 메시지 전송
          try {
            await chrome.tabs.sendMessage(tab.id, {
              type: 'TAB_ID_UPDATE',
              payload: { tabId: tab.id }
            });
            console.log(`Successfully injected and updated tab ${tab.id}`);
            return { tabId: tab.id, status: 'success' };
          } catch (updateError) {
            console.warn(`Failed to send TAB_ID_UPDATE to tab ${tab.id}:`, updateError.message);
            return { tabId: tab.id, status: 'injection_success_update_failed', error: updateError.message };
          }
          
        } else {
          console.log(`Tab ${tab.id} is not ready for injection (status: ${tab.status}, discarded: ${tab.discarded})`);
          return { tabId: tab.id, status: 'not_ready', reason: `status: ${tab.status}, discarded: ${tab.discarded}` };
        }
      } catch (error) {
        console.warn(`Failed to inject content script to tab ${tab.id}:`, error.message);
        return { tabId: tab.id, status: 'failed', error: error.message };
      }
    });

    // 모든 주입 작업 완료 대기
    const results = await Promise.allSettled(injectionPromises);
    
    // 결과 로그 및 통계
    const summary = {
      total: tabs.length,
      success: 0,
      already_exists: 0,
      failed: 0,
      not_ready: 0
    };

    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        const { status } = result.value;
        if (status === 'success' || status === 'injection_success_update_failed') {
          summary.success++;
        } else if (status === 'already_exists') {
          summary.already_exists++;
        } else if (status === 'not_ready') {
          summary.not_ready++;
        } else {
          summary.failed++;
        }
      } else {
        summary.failed++;
        console.error(`Injection promise rejected for tab:`, result.reason);
      }
    });

    console.log('Content script injection summary:', summary);
    
  } catch (error) {
    console.error('Error in injectContentScriptToExistingTabs:', error);
  }
}

// Chrome extension 업데이트 감지 및 알림
chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    // 확장 프로그램이 처음 설치될 때 전역 기본값 설정
    chrome.storage.sync.set({
      theme: 'light', // 전역 테마 설정
      debugLogEnabled: false, // 디버그 로그 기본값: 비활성
    });
    console.log('Default global settings applied on installation.');
    
    // 기존에 열려있는 X(트위터) 탭에 Content Script 주입
    await injectContentScriptToExistingTabs();
  } else if (details.reason === 'update') {
    const previousVersion = details.previousVersion;
    const manifest = chrome.runtime.getManifest();
    const currentVersion = manifest.version;
    
    console.log(`Extension updated from ${previousVersion} to ${currentVersion}`);
    
    // 업데이트 알림을 모든 관련 탭에 전송
    await notifyUpdateToAllTabs(previousVersion, currentVersion);
    
    // 기존에 열려있는 X(트위터) 탭에 Content Script 재주입
    await injectContentScriptToExistingTabs();
  }
});

/**
 * 모든 X(트위터) 탭에 업데이트 알림 전송
 */
async function notifyUpdateToAllTabs(previousVersion, currentVersion) {
  try {
    const tabs = await chrome.tabs.query({
      url: ['*://x.com/*', '*://twitter.com/*']
    });
    
    console.log(`Notifying ${tabs.length} tabs about extension update`);
    
    const notificationPromises = tabs.map(tab => {
      if (tab.id && tab.status === 'complete') {
        return chrome.tabs.sendMessage(tab.id, {
          action: 'extensionUpdated',
          previousVersion,
          currentVersion,
          timestamp: Date.now()
        }).catch(error => {
          console.debug(`Failed to notify tab ${tab.id} about update:`, error.message);
        });
      }
    });
    
    await Promise.allSettled(notificationPromises);
    console.log('Update notifications sent to all eligible tabs');
    
  } catch (error) {
    console.error('Error notifying tabs about update:', error);
  }
}

// Content Script가 로드될 때 실제 탭 ID를 전달
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // 페이지 로딩이 완료되었을 때 X(트위터) 도메인인 경우에만 처리
  if (changeInfo.status === 'complete' && tab.url && 
      (tab.url.includes('x.com') || tab.url.includes('twitter.com'))) {
    console.log(`Tab ${tabId} updated: ${tab.url}`);
    
    // Content Script 로딩 대기 후 메시지 전송
    setTimeout(() => {
      chrome.tabs.sendMessage(tabId, {
        type: 'TAB_ID_UPDATE',
        payload: { tabId: tabId }
      }).catch((error) => {
        console.debug(`Failed to send TAB_ID_UPDATE to tab ${tabId}: ${error?.message || 'unknown error'}`);
      });
    }, 1500); // 1.5초 대기 후 전송 (기존 1초에서 증가)
  }
});

// 탭이 닫힐 때 해당 탭의 설정 정리
chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
  // 해당 탭의 설정들을 정리
  chrome.storage.sync.get(null, (items) => {
    const keysToRemove = [];
    const tabSuffix = `_tab_${tabId}`;
    
    for (const key in items) {
      if (key.endsWith(tabSuffix)) {
        keysToRemove.push(key);
      }
    }
    
    if (keysToRemove.length > 0) {
      chrome.storage.sync.remove(keysToRemove, () => {
        console.log(`Cleaned up settings for closed tab ${tabId}:`, keysToRemove);
      });
    }
  });
});

// Storage 변경 감지 및 다른 탭들에 브로드캐스트
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'sync') {
    // 전역 설정 변경 감지 (새로고침 주기, 클릭 간 대기시간, 테마, 디버그 로그)
    const globalSettings = ['refreshInterval', 'clickDelayMs', 'theme', 'debugLogEnabled'];
    const changedGlobalSettings = {};
    let hasGlobalChanges = false;
    
    for (const [key, { oldValue, newValue }] of Object.entries(changes)) {
      if (globalSettings.includes(key)) {
        // 값이 실제로 변경된 경우만 브로드캐스트 (무한 루프 방지)
        if (oldValue !== newValue) {
          changedGlobalSettings[key] = newValue;
          hasGlobalChanges = true;
        }
      }
    }
    
    // 전역 설정이 실제로 변경된 경우만 모든 탭에 브로드캐스트
    if (hasGlobalChanges) {
      console.log('Broadcasting global settings changes:', changedGlobalSettings);
      broadcastSettingsToAllTabs(changedGlobalSettings);
    }
  }
});

// 모든 탭에 설정 변경 사항 브로드캐스트
function broadcastSettingsToAllTabs(settings) {
  // X(트위터) 도메인만 대상으로 탭 쿼리
  chrome.tabs.query({
    url: ['*://x.com/*', '*://twitter.com/*']
  }, (tabs) => {
    console.log(`Broadcasting settings to ${tabs.length} X(트위터) tabs`);
    tabs.forEach(tab => {
      if (tab.url && tab.id) {
        chrome.tabs.sendMessage(tab.id, {
          type: 'SETTINGS_UPDATED',
          payload: { settings }
        }).catch((error) => {
          // Content Script가 로드되지 않았거나 지원하지 않는 페이지일 수 있음
          console.debug(`Failed to send message to tab ${tab.id}: ${error?.message || 'unknown error'}`);
        });
      }
    });
  });
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  const { type, payload } = request;
  
  switch (type) {
    case 'GET_TAB_ID':
      // Content Script가 요청할 때 탭 ID 반환
      if (sender.tab && sender.tab.id) {
        sendResponse({ status: 'success', tabId: sender.tab.id });
      } else {
        sendResponse({ status: 'error', message: 'No tab ID available' });
      }
      break;
      
    default:
      sendResponse({ status: 'Background script received message' });
  }
  
  return true;
});

// Chrome extension 시작 시 상태 복구
chrome.runtime.onStartup.addListener(() => {
  console.log('Extension startup detected');
  // 필요 시 기존 탭들에 Content Script 재주입
  setTimeout(() => {
    injectContentScriptToExistingTabs();
  }, 1000);
});

// Service Worker 깨어날 때 상태 복구
chrome.runtime.onSuspend.addListener(() => {
  console.log('Service worker suspending');
});

// 브라우저 세션 복구 시 처리
if (chrome.runtime.onRestartRequired) {
  chrome.runtime.onRestartRequired.addListener((reason) => {
    console.log('Runtime restart required:', reason);
  });
}