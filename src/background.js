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
  }
});

// Content Script가 로드될 때 실제 탭 ID를 전달
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // 페이지 로딩이 완료되었을 때
  if (changeInfo.status === 'complete' && tab.url) {
    // Content Script에 실제 탭 ID 전달
    chrome.tabs.sendMessage(tabId, {
      type: 'TAB_ID_UPDATE',
      payload: { tabId: tabId }
    }).catch(() => {
      // Content Script가 아직 로드되지 않았거나 지원하지 않는 페이지일 수 있음
      // 에러를 무시함
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