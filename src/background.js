'use strict';

// With background scripts you can communicate with popup
// and contentScript files.
// For more information on background script,
// See https://developer.chrome.com/extensions/background_pages

chrome.runtime.onInstalled.addListener(details => {
  if (details.reason === 'install') {
    // 확장 프로그램이 처음 설치될 때 기본값 설정
    chrome.storage.sync.set({
      masterOn: true, // 마스터 버튼 기본 상태 ON
      refreshInterval: 3, // 새로고침 주기 기본값 3초
    });
    console.log('Default settings applied on installation.');
  }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'GREETINGS') {
    const message = `Hi ${
      sender.tab ? 'Con' : 'Pop'
    }, my name is Bac. I am from Background. It's great to hear from you.`;

    // Log message coming from the `request` parameter
    console.log(request.payload.message);
    // Send a response message
    sendResponse({
      message,
    });
  } else if (request.type === 'MASTER_TOGGLE_BG') {
    // popup.js로부터 메시지를 받아 contentScript.js로 전달
    if (request.payload && typeof request.payload.tabId === 'number') {
      chrome.tabs.sendMessage(request.payload.tabId, {
        type: 'MASTER_TOGGLE_CS', // contentScript가 받을 메시지 타입
        isOn: request.payload.isOn,
      }, response => {
        if (chrome.runtime.lastError) {
          console.log('Error sending message to content script:', chrome.runtime.lastError.message);
        } else {
          console.log('Message sent to content script, response:', response);
        }
      });
      sendResponse({ status: 'Message relayed to content script' });
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
  }
});
