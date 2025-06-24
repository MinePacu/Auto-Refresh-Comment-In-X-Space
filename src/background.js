'use strict';

// Background script for managing tab-specific settings
// For more information on background script,
// See https://developer.chrome.com/extensions/background_pages

chrome.runtime.onInstalled.addListener(details => {
  if (details.reason === 'install') {
    // 확장 프로그램이 처음 설치될 때 전역 기본값 설정
    chrome.storage.sync.set({
      theme: 'system', // 전역 테마 설정
      debugLogEnabled: false, // 디버그 로그 기본값: 비활성
    });
    console.log('Default global settings applied on installation.');
    
    // 설치 후 X.com 페이지를 자동으로 열어 권한 즉시 활성화
    chrome.tabs.create({ url: 'https://x.com' });
  } else if (details.reason === 'update') {
    // 확장 프로그램이 업데이트될 때 권한 관련 알림 표시
    const previousVersion = details.previousVersion;
    const manifest = chrome.runtime.getManifest();
    const currentVersion = manifest.version;
    
    console.log(`Extension updated from ${previousVersion} to ${currentVersion}`);
    
    // 버전 0.1.1에서 host_permissions가 추가된 경우 (사이트 액세스 권한 추가)
    if (previousVersion && previousVersion === '0.1.0' && currentVersion === '0.1.1') {
      // 필요한 경우 알림 표시
      chrome.notifications.create('host_permissions_added', {
        type: 'basic',
        iconUrl: 'icons/icon_128.png',
        title: '확장 프로그램 권한 업데이트',
        message: 'X.com 사이트에 자동 액세스 권한이 추가되었습니다.',
        priority: 1
      });
    }
  }
});

// Content Script가 로드될 때 실제 탭 ID를 전달
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // 페이지 로딩이 완료되었을 때 X(트위터) 도메인인 경우에만 처리
  if (changeInfo.status === 'complete' && tab.url && 
      (tab.url.includes('x.com') || tab.url.includes('twitter.com'))) {
    console.log(`Tab ${tabId} updated: ${tab.url}`);
    // Content Script에 실제 탭 ID 전달
    chrome.tabs.sendMessage(tabId, {
      type: 'TAB_ID_UPDATE',
      payload: { tabId: tabId }
    }).catch((error) => {
      // Content Script가 아직 로드되지 않았거나 지원하지 않는 페이지일 수 있음
      console.debug(`Failed to send TAB_ID_UPDATE to tab ${tabId}: ${error?.message || 'unknown error'}`);
    });
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