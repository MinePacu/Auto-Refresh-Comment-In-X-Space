'use strict';

// Content script file will run in the context of web page.
// With content script you can manipulate the web pages using
// Document Object Model (DOM).
// You can also pass information to the parent extension.

// We execute this script by making an entry in manifest.json file
// under `content_scripts` property

// For more information on Content Scripts,
// See https://developer.chrome.com/extensions/content_scripts

/**
 * 현재 페이지에서 보고 있는 트위터 유저가 스페이스 중인지 확인하는 함수
 * @returns {boolean}
 */
function isUserInSpace() {
  // "스페이스에 참여하기", "Join this Space", "스페이스 청취 중", "Listening to this Space", "녹음 재생" 버튼이 있는지 확인
  const joinSpaceButton = Array.from(document.querySelectorAll('span, div, button'))
    .some(el => {
      const text = el.textContent?.trim();
      return (
        text === '스페이스에 참여하기' ||
        text === 'Join this Space' ||
        text === '스페이스 청취 중' ||
        text === 'Listening to this Space' ||
        text === '녹음 재생' ||         // 녹음 재생 버튼(한국어)
        text === 'Play Recording'      // 녹음 재생 버튼(영어)
      );
    });

  // 프로필 상단에 스페이스 관련 배지가 있는지 확인 (예시)
  const spaceBadge = document.querySelector('svg[aria-label="Spaces"]');

  // 스페이스 청취 중임을 나타내는 배지나 텍스트가 있는지 추가 확인
  const listeningBadge = Array.from(document.querySelectorAll('span, div'))
    .some(el => {
      const text = el.textContent?.trim();
      return (
        text === '스페이스 청취 중' ||
        text === 'Listening to this Space'
      );
    });

  return joinSpaceButton || !!spaceBadge || listeningBadge;
}

// 트위터의 게시글 및 답글이 모두 로드된 후 스크롤을 실행하는 함수
function waitForTweetsAndReplies(callback, timeout = 10000) {
  const start = Date.now();
  const checkInterval = 500;

  function check() {
    // 트위터의 게시글(트윗)과 답글이 충분히 로드되었는지 확인
    // 트윗 컨테이너(예: [data-testid="cellInnerDiv"])가 일정 개수 이상 있는지로 판단
    const tweetElements = document.querySelectorAll('[data-testid="cellInnerDiv"]');
    if (tweetElements.length > 10) { // 10개 이상이면 충분히 로드된 것으로 간주
      callback();
      return;
    }
    if (Date.now() - start > timeout) {
      // 타임아웃 시에도 콜백 실행
      callback();
      return;
    }
    setTimeout(check, checkInterval);
  }

  check();
}

let masterOn = true; // 기본값

// 마스터 상태를 storage에서 불러오기
chrome.storage && chrome.storage.sync.get(['masterOn'], result => {
  if (typeof result.masterOn === 'boolean') {
    masterOn = result.masterOn;
  }
});

// 마스터 토글 메시지 수신
chrome.runtime && chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'MASTER_TOGGLE_CS') { // background.js로부터 오는 메시지 타입
    masterOn = msg.isOn;
    if (!masterOn) {
      stopContentScriptFeatures();
      console.log('Content script features stopped by master toggle.');
      sendResponse({ status: 'Content script features stopped.' });
    } else {
      startContentScriptFeatures(); // masterOn이 true일 때 기능 재시작
      console.log('Content script features (re)started by master toggle.');
      sendResponse({ status: 'Content script features (re)started.' });
    }
  }
});

// 기능 수행 함수
function startContentScriptFeatures() {
  // 기존 기능을 한 번 실행
  mainFeatureLogic();
}

// 기능 멈춤 함수
function stopContentScriptFeatures() {
  // setTimeout, setInterval 등 반복 동작이 있다면 clear
  // 예시: 스크롤 타이머 멈추기 등
  // 필요시 추가 구현
}

// 기존 기능을 함수로 분리
function mainFeatureLogic() {
  // 현재 사이트가 트위터 또는 X인지 확인
  if (!masterOn) return;
  if (window.location.hostname === 'twitter.com' || window.location.hostname === 'x.com') {
    console.log('이 유저가 스페이스 중인가?', isUserInSpace());

    const buttons = document.querySelectorAll('button');
    console.log(
      `이 페이지에는 ${buttons.length}개의 button 요소가 있습니다.`,
      buttons
    );
    
    // 주소에 'status'가 포함된 경우(트윗 상세 페이지)
    if (window.location.pathname.includes('status')) {
      waitForTweetsAndReplies(() => {
        if (!masterOn) return;
        (async function scrollForReplySettings() {
          console.log('답글에 대한 설정 버튼을 출력하기 위해 강제 스크롤을 시행합니다.');
          const scrollStep = 100; // 한 번에 스크롤할 픽셀 수
          for (let i = 0; i < 5; i++) {
            window.scrollBy(0, scrollStep);
            await new Promise(res => setTimeout(res, 300)); // 스크롤 후 잠깐 대기
            if (!masterOn) break;
          }
          window.scrollTo(0, 0); // 맨 위로 이동
        })();
      });
    } else {
      console.log('status가 포함된 트윗 상세 페이지가 아니므로 스크롤을 실행하지 않습니다.');
    }
  } else {
    console.log('현재 사이트는 트위터 또는 X가 아닙니다.');
  }
}

// 최초 실행
// mainFeatureLogic();