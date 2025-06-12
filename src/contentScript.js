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
  // "스페이스에 참여하기" 또는 "Join this Space" 버튼이 있는지 확인
  const joinSpaceButton = Array.from(document.querySelectorAll('span, div, button'))
    .some(el => {
      const text = el.textContent?.trim();
      return (
        text === '스페이스에 참여하기' ||
        text === 'Join this Space' ||
        text === '스페이스 청취 중' || // 청취 중인 경우 (한국어)
        text === 'Listening to this Space' // 청취 중인 경우 (영어)
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

// 현재 사이트가 트위터 또는 X인지 확인
if (window.location.hostname === 'twitter.com' || window.location.hostname === 'x.com') {
  console.log('이 유저가 스페이스 중인가?', isUserInSpace());

  const buttons = document.querySelectorAll('button');
  console.log(
    `이 페이지에는 ${buttons.length}개의 button 요소가 있습니다.`,
    buttons
  );
} else {
  console.log('현재 사이트는 트위터 또는 X가 아닙니다.');
}