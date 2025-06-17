'use strict';

// With background scripts you can communicate with popup
// and contentScript files.
// For more information on background script,
// See https://developer.chrome.com/extensions/background_pages

chrome.runtime.onInstalled.addListener(details => {
  if (details.reason === 'install') {
    // 확장 프로그램이 처음 설치될 때 기본값 설정
    chrome.storage.sync.set({
      masterOn: false, // 마스터 버튼 기본 상태 OFF
      refreshInterval: 10, // 새로고침 주기 기본값 10초
      clickDelayMs: 700, // 클릭 간 대기 시간 기본값 700ms
    });
    console.log('Default settings applied on installation.');
  }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // popup.js 또는 contentScript.js로부터 메시지를 받음
  if (request.type === 'GET_PAGE_STATUS_BG') {
    // popup.js로부터 페이지 상태 요청을 받아 contentScript.js로 전달
    if (request.payload && typeof request.payload.tabId === 'number') {
      chrome.tabs.sendMessage(request.payload.tabId, {
        type: 'GET_PAGE_STATUS', // contentScript가 받을 메시지 타입
      }, response => {
        if (chrome.runtime.lastError) {
          console.log('Error getting page status from content script:', chrome.runtime.lastError.message);
          // 콘텐츠 스크립트와 통신할 수 없는 경우 (예: 비트위터 사이트)
          sendResponse({ status: 'WAITING_FOR_TWITTER', message: '트위터 접속 대기 중' });
        } else {
          // response가 undefined인 경우 기본값 제공
          sendResponse(response || { status: 'WAITING_FOR_TWITTER', message: '트위터 접속 대기 중' });
        }
      });
    } else {
      sendResponse({ status: 'WAITING_FOR_TWITTER', message: '트위터 접속 대기 중' });
    }
    return true; // 비동기 응답을 위해 true 반환  } else if (request.type === 'MASTER_TOGGLE_BG') {
    // popup.js로부터 메시지를 받아 contentScript.js로 전달
    if (request.payload && typeof request.payload.tabId === 'number') {
      chrome.tabs.sendMessage(request.payload.tabId, {
        type: 'MASTER_TOGGLE_CS', // contentScript가 받을 메시지 타입
        isOn: request.payload.isOn,
      }, response => {
        if (chrome.runtime.lastError) {
          console.log('Error sending message to content script:', chrome.runtime.lastError.message);
          // 에러가 발생해도 응답을 보내서 popup이 처리할 수 있도록 함
          sendResponse({ status: 'Error: Could not communicate with content script', error: chrome.runtime.lastError.message });
        } else {
          console.log('Message sent to content script, response:', response);
          // contentScript로부터 받은 응답을 그대로 전달 (undefined 체크 추가)
          sendResponse(response || { status: 'Message relayed to content script' });
        }
      });
    } else {
      sendResponse({ status: 'Error: tabId not provided or invalid' });
    }
    return true; // 비동기 응답을 위해 true 반환
  } else if (request.type === 'SET_REFRESH_INTERVAL_BG') {
    // popup.js로부터 새로고침 주기 설정을 받아 contentScript.js로 전달
    if (request.payload && typeof request.payload.tabId === 'number' && typeof request.payload.interval === 'number') {
      chrome.tabs.sendMessage(request.payload.tabId, {
        type: 'SET_REFRESH_INTERVAL_CS', // contentScript가 받을 메시지 타입
        interval: request.payload.interval,
      }, response => {
        if (chrome.runtime.lastError) {
          console.log('Error sending refresh interval to content script:', chrome.runtime.lastError.message);
        } else {
          console.log('Refresh interval sent to content script, response:', response);
        }
      });
      sendResponse({ status: 'Refresh interval relayed to content script' });
    } else {
      sendResponse({ status: 'Error: tabId or interval not provided or invalid' });
    }
    return true; // 비동기 응답을 위해 true 반환
  } else if (request.type === 'SET_CLICK_DELAY_BG') {
    // popup.js로부터 클릭 간 대기시간 설정을 받아 contentScript.js로 전달
    if (request.payload && typeof request.payload.tabId === 'number' && typeof request.payload.delay === 'number') {
      chrome.tabs.sendMessage(request.payload.tabId, {
        type: 'SET_CLICK_DELAY_CS', // contentScript가 받을 메시지 타입
        delay: request.payload.delay,
      }, response => {
        if (chrome.runtime.lastError) {
          console.log('Error sending click delay to content script:', chrome.runtime.lastError.message);
        } else {
          console.log('Click delay sent to content script, response:', response);
        }
      });
      sendResponse({ status: 'Click delay relayed to content script' });
    } else {
      sendResponse({ status: 'Error: tabId or delay not provided or invalid' });
    }    return true; // 비동기 응답을 위해 true 반환
  } else if (request.type === 'GREETINGS') {
    // popup.js로부터 인사 메시지를 받음
    console.log('Received greetings from popup:', request.payload?.message);
    sendResponse({ message: 'Hello from background script!' });
    return true; // 비동기 응답을 위해 true 반환
  }
  
  // 알 수 없는 메시지 타입의 경우 기본 응답
  sendResponse({ status: 'Unknown message type' });
  return true;
});
