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
 * 스페이스 참여 상태를 다양한 방법으로 감지합니다:
 * 1. 버튼 텍스트 확인 ("참여했습니다", "스페이스 청취 중" 등)
 * 2. 스페이스 관련 SVG 배지 확인
 * 3. 오디오 플레이어 컨트롤 확인
 * 4. aria-label 속성을 통한 참여 상태 확인
 * @returns {boolean} 스페이스를 청취 중이면 true, 아니면 false
 */
function isUserInSpace() {
  // "스페이스에 참여하기", "Join this Space", "스페이스 청취 중", "Listening to this Space", "참여했습니다" 버튼이 있는지 확인
  const joinSpaceButton = Array.from(document.querySelectorAll('span, div, button'))
    .some(el => {
      const text = el.textContent?.trim();
      return (
        text === '스페이스에 참여하기' ||
        text === 'Join this Space' ||
        text === '스페이스 청취 중' ||
        text === 'Listening to this Space' ||
        text === '참여했습니다' ||           // 스페이스 참여 완료 상태(한국어)
        text === 'Joined' ||               // 스페이스 참여 완료 상태(영어)
        text === 'You joined this Space'   // 스페이스 참여 완료 상태(영어 전체)
        //text === '녹음 재생' ||         // 녹음 재생 버튼(한국어)
        //text === 'Play Recording'      // 녹음 재생 버튼(영어)
      );
    });
  // 프로필 상단에 스페이스 관련 배지가 있는지 확인
  const spaceBadge = document.querySelector('svg[aria-label="Spaces"]');

  // 스페이스 청취 중임을 나타내는 배지나 텍스트가 있는지 추가 확인
  const listeningBadge = Array.from(document.querySelectorAll('span, div'))
    .some(el => {
      const text = el.textContent?.trim();
      return (
        text === '스페이스 청취 중' ||
        text === 'Listening to this Space' ||
        text === '참여했습니다' ||           // 스페이스 참여 완료 상태(한국어)
        text === 'Joined' ||               // 스페이스 참여 완료 상태(영어)
        text === 'You joined this Space'   // 스페이스 참여 완료 상태(영어 전체)
      );
    });

  // 스페이스 오디오 플레이어나 컨트롤이 있는지 확인 (추가 검증)
  const audioControls = document.querySelector('[data-testid="SpacePlayer"]') || 
                       document.querySelector('[aria-label*="Space"]') ||
                       document.querySelector('[aria-label*="스페이스"]');
  // 스페이스 참여 상태를 나타내는 더 구체적인 UI 요소 확인
  const spaceParticipantIndicator = Array.from(document.querySelectorAll('*'))
    .some(el => {
      const ariaLabel = el.getAttribute('aria-label');
      const text = el.textContent?.trim();
      return (
        ariaLabel?.includes('참여') ||
        ariaLabel?.includes('joined') ||
        ariaLabel?.includes('listening') ||
        text?.includes('참여 중') ||
        text?.includes('청취 중')
      );
    });

  // 디버깅을 위한 감지 결과 로그 (마스터가 ON일 때만)
  if (masterOn) {
    console.log('스페이스 청취 상태 감지 결과:', {
      joinSpaceButton,
      spaceBadge: !!spaceBadge,
      listeningBadge,
      audioControls: !!audioControls,
      spaceParticipantIndicator,
      finalResult: joinSpaceButton || !!spaceBadge || listeningBadge || !!audioControls || spaceParticipantIndicator
    });
  }

  return joinSpaceButton || !!spaceBadge || listeningBadge || !!audioControls || spaceParticipantIndicator;
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

let masterOn = false; // 기본값 OFF
let currentRefreshInterval = 10; // 기본값 10초
let replySettingsButtonElement = null; // 답글 설정 버튼 참조 저장
let sortByLatestButtonElement = null; // 최신순 정렬 버튼 참조 저장
let refreshIntervalId = null; // setInterval ID 저장
let currentClickDelayMs = 700; // 클릭 간 대기 시간 기본값
let conditionCheckIntervalId = null; // 조건 확인 인터벌 ID

// XPath 및 지연 시간 상수 정의
const REPLY_SETTINGS_BUTTON_XPATH = '//*[@id="react-root"]/div/div/div[2]/main/div/div/div/div[1]/div/div[1]/div[1]/div/div/div/div/div/div[3]/div/button[2]';
const MODAL_XPATH = '//*[@id="layers"]/div[2]/div/div/div/div[2]/div/div[3]';
const SORT_BY_LATEST_BUTTON_XPATH = '//*[@id="layers"]/div[2]/div/div/div/div[2]/div/div[3]/div/div/div/div[3]';
// const DELAY_AFTER_REPLY_SETTINGS_CLICK_MS = 700; // 이 상수는 currentClickDelayMs 변수로 대체됨

// 마스터 상태 및 새로고침 주기 storage에서 불러오기
function loadSettingsFromStorage() {
  chrome.storage && chrome.storage.sync.get(['masterOn', 'refreshInterval', 'clickDelayMs'], result => {
    if (typeof result.masterOn === 'boolean') {
      masterOn = result.masterOn;
      
      // 초기 로드 시 마스터가 ON이면 조건 확인 시작
      if (masterOn) {
        console.log('초기 로드: 마스터가 ON 상태이므로 조건 확인을 시작합니다.');
        const pageStatus = getCurrentPageStatus();
        if (pageStatus.status === 'READY') {
          startContentScriptFeatures();
        } else {
          startConditionChecking();
        }
      }
    }
    if (typeof result.refreshInterval === 'number') {
      currentRefreshInterval = result.refreshInterval;
      console.log('Loaded refresh interval from storage:', currentRefreshInterval);
    }
    if (typeof result.clickDelayMs === 'number') {
      currentClickDelayMs = result.clickDelayMs;
      console.log('Loaded click delay from storage:', currentClickDelayMs);
    }
  });
}

loadSettingsFromStorage();

// 현재 페이지 상태를 확인하는 함수
function getCurrentPageStatus() {
  const isTwitterSite = window.location.hostname === 'twitter.com' || window.location.hostname === 'x.com';
    // 트윗 상세 페이지 URL 패턴 확인 - 더 정확한 검사
  // 예: https://x.com/username/status/1234567890
  // 또는: https://twitter.com/username/status/1234567890
  const pathParts = window.location.pathname.split('/').filter(part => part.length > 0);
  const isStatusPage = window.location.pathname.includes('/status/') && 
                      pathParts.length >= 3 && // ['username', 'status', 'tweetId'] 최소 구조
                      pathParts[1] === 'status' &&
                      pathParts[2] && pathParts[2].length > 0; // 트윗 ID가 실제로 존재하는지 확인
    const isInSpace = isUserInSpace();
  
  // 마스터가 ON일 때만 상세 로그 출력 (로그 스팸 방지)
  if (masterOn) {
    console.log('Page status check:', {
      hostname: window.location.hostname,
      pathname: window.location.pathname,
      pathParts: pathParts,
      href: window.location.href,
      isTwitterSite,
      isStatusPage,
      isInSpace,
      statusPageCheck: {
        includesStatus: window.location.pathname.includes('/status/'),
        pathPartsLength: pathParts.length,
        secondPartIsStatus: pathParts[1] === 'status',
        thirdPartExists: pathParts[2] && pathParts[2].length > 0
      },
      currentStatus: !isTwitterSite ? 'NOT_TWITTER' : !isStatusPage ? 'NOT_STATUS_PAGE' : !isInSpace ? 'NOT_IN_SPACE' : 'READY'
    });
  }
  
  if (!isTwitterSite) {
    return { status: 'WAITING_FOR_TWITTER', message: '트위터 접속 대기 중' };  } else if (!isStatusPage) {    // 트위터에는 접속했지만 게시글 상세 페이지가 아닌 경우
    // 예시 URL들:
    // - https://x.com (홈)
    // - https://x.com/home (홈 피드)
    // - https://x.com/explore (탐색)
    // - https://x.com/notifications (알림)
    // - https://x.com/messages (메시지)
    // - https://x.com/username (프로필)
    // - https://x.com/settings (설정)
    // - https://x.com/i/lists (리스트)
    // - https://x.com/i/bookmarks (북마크)
    if (masterOn) {
      console.log('트위터 사이트에는 접속했지만 트윗 상세 페이지가 아님. 현재 경로:', window.location.pathname);
    }
    return { status: 'WAITING_FOR_STATUS_PAGE', message: '트윗 상세 페이지 대기 중' };
  } else if (!isInSpace) {
    // 게시글 상세 페이지에는 있지만 스페이스를 청취하지 않는 경우
    if (masterOn) {
      console.log('트윗 상세 페이지에는 있지만 스페이스를 청취하지 않음');
    }
    return { status: 'WAITING_FOR_SPACE', message: '스페이스 청취 대기 중' };
  } else {
    // 모든 조건이 충족된 경우: 트위터 사이트 + 트윗 상세 페이지 + 스페이스 청취 중
    if (masterOn) {
      console.log('모든 조건 충족: 기능 활성화 준비 완료');
    }
    return { status: 'READY', message: '상태: 활성화됨' };
  }
}

// 조건 확인 및 자동 시작 함수
function checkConditionsAndStart() {
  if (!masterOn) {
    // 마스터가 OFF면 조건 확인 중지
    if (conditionCheckIntervalId) {
      clearInterval(conditionCheckIntervalId);
      conditionCheckIntervalId = null;
      console.log('조건 확인 중지: 마스터 OFF');
    }
    return;
  }

  const pageStatus = getCurrentPageStatus();
  
  if (pageStatus.status === 'READY' && !refreshIntervalId) {
    // 조건이 충족되고 아직 기능이 시작되지 않은 경우
    console.log('조건 충족됨! 자동으로 기능을 시작합니다.');
    stopConditionChecking(); // 조건 확인 중지 (기능이 시작되므로)
    startContentScriptFeatures();
  } else if (pageStatus.status !== 'READY' && refreshIntervalId) {
    // 조건이 충족되지 않고 기능이 실행 중인 경우 중지
    console.log('조건 미충족으로 기능을 중지합니다:', pageStatus.message);
    stopContentScriptFeatures();
    startConditionChecking(); // 다시 조건 확인 시작
  }
}

// 조건 확인 인터벌 시작
function startConditionChecking() {
  if (conditionCheckIntervalId) {
    clearInterval(conditionCheckIntervalId);
  }
  // 즉시 한 번 확인 실행
  checkConditionsAndStart();
  // 그 후 3초마다 확인
  conditionCheckIntervalId = setInterval(checkConditionsAndStart, 3000);
  console.log('조건 확인 인터벌 시작 (즉시 확인 후 3초마다)');
}

// URL 변경 감지를 위한 변수
let currentURL = window.location.href;

// SPA에서 URL 변경 감지를 위한 history API 오버라이드
const originalPushState = history.pushState;
const originalReplaceState = history.replaceState;

// pushState 오버라이드
history.pushState = function(...args) {
  originalPushState.apply(history, args);
  setTimeout(() => {
    if (masterOn) {
      console.log('pushState로 인한 URL 변경 감지');
      detectURLChange();
    }
  }, 100); // 약간의 지연을 두어 DOM 업데이트 대기
};

// replaceState 오버라이드
history.replaceState = function(...args) {
  originalReplaceState.apply(history, args);
  setTimeout(() => {
    if (masterOn) {
      console.log('replaceState로 인한 URL 변경 감지');
      detectURLChange();
    }
  }, 100);
};

// popstate 이벤트 리스너 (뒤로가기/앞으로가기)
window.addEventListener('popstate', function(event) {
  if (masterOn) {
    console.log('popstate로 인한 URL 변경 감지');
    setTimeout(() => {
      detectURLChange();
    }, 100);
  }
});

// URL 변경 감지 및 즉시 상태 갱신
function detectURLChange() {
  const newURL = window.location.href;
  if (currentURL !== newURL) {
    if (masterOn) {
      console.log('URL 변경 감지:', currentURL, '->', newURL);
    }
    currentURL = newURL;
    
    // 마스터가 ON 상태일 때만 즉시 조건 확인
    if (masterOn) {
      console.log('URL 변경으로 인한 즉시 조건 확인 실행');
      checkConditionsAndStart();
    }
  }
}

// URL 변경 감지 인터벌 (빠른 감지를 위해 500ms마다)
let urlCheckIntervalId = null;

function startURLChangeDetection() {
  if (urlCheckIntervalId) {
    clearInterval(urlCheckIntervalId);
  }
  urlCheckIntervalId = setInterval(detectURLChange, 500);
  if (masterOn) {
    console.log('URL 변경 감지 시작');
  }
}

function stopURLChangeDetection() {
  if (urlCheckIntervalId) {
    clearInterval(urlCheckIntervalId);
    urlCheckIntervalId = null;
    if (masterOn) {
      console.log('URL 변경 감지 중지');
    }
  }
}

// 조건 확인 인터벌 중지
function stopConditionChecking() {
  if (conditionCheckIntervalId) {
    clearInterval(conditionCheckIntervalId);
    conditionCheckIntervalId = null;
    if (masterOn) {
      console.log('조건 확인 인터벌 중지');
    }
  }
}

// 메시지 수신 로직
chrome.runtime && chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (masterOn) {
    console.log('Content script received message:', msg.type);
  }
  
  try {    
    if (msg.type === 'GET_PAGE_STATUS') {
      // 팝업에서 현재 페이지 상태를 요청할 때
      const pageStatus = getCurrentPageStatus();
      
      // 마스터가 ON일 때만 상세 로그 출력 (로그 스팸 방지)
      if (masterOn) {
        console.log('Sending page status:', pageStatus);
      }
      
      sendResponse(pageStatus);
      return true; // 동기 응답임을 명시
    } else if (msg.type === 'MASTER_TOGGLE_CS') {
      masterOn = msg.isOn;
      
      if (!masterOn) {
        stopContentScriptFeatures();
        stopConditionChecking();
        stopURLChangeDetection(); // URL 변경 감지도 중지
        console.log('Content script features stopped by master toggle.');
        sendResponse({ status: 'Content script features stopped.' });
      } else {
        // 마스터 ON 시 URL 변경 감지 시작
        startURLChangeDetection();
        
        // 현재 페이지 상태 확인
        const pageStatus = getCurrentPageStatus();
        console.log('마스터 ON 요청 - 현재 페이지 상태:', pageStatus);
        
        if (pageStatus.status === 'READY') {
          // 모든 조건이 충족된 경우에만 기능 시작
          startContentScriptFeatures();
          console.log('Content script features (re)started by master toggle - 모든 조건 충족됨.');
          sendResponse({ status: 'Content script features (re)started.', pageStatus: pageStatus });
        } else {
          // 조건이 충족되지 않아도 마스터 상태는 ON으로 유지하고, 조건 확인 시작
          console.log('마스터 ON 상태로 설정됨. 조건 충족 대기 중:', pageStatus.message);
          startConditionChecking(); // 조건 확인 시작
          sendResponse({ status: pageStatus.message, pageStatus: pageStatus });
        }
      }      return true; // 동기 응답임을 명시
    } else if (msg.type === 'SET_REFRESH_INTERVAL_CS') {
      if (typeof msg.interval === 'number') {
        currentRefreshInterval = msg.interval; // 1. 로컬 변수 업데이트
        chrome.storage.sync.set({ refreshInterval: currentRefreshInterval }); // 2. 변경된 값 스토리지에 저장
        console.log('Refresh interval updated to:', currentRefreshInterval);
        sendResponse({ status: 'Refresh interval updated.' });

        // 3. 마스터 버튼이 ON이고, 기존 인터벌이 실행 중이었다면 재시작
        if (masterOn && refreshIntervalId) {
          console.log('Restarting recurring sort click due to interval change.');
          clearInterval(refreshIntervalId); // 3a. 기존 인터벌 중지
          refreshIntervalId = setInterval(performRecurringSortClick, currentRefreshInterval * 1000); // 3b. 새 주기로 인터벌 시작
          console.log(`Recurring sort click interval restarted with new interval: ${currentRefreshInterval}s`);
        }
      } else {
        sendResponse({ status: 'Error: Invalid interval.' });
      }
      return true; // 동기 응답임을 명시
    } else if (msg.type === 'SET_CLICK_DELAY_CS') {
      if (typeof msg.delay === 'number') {
        currentClickDelayMs = msg.delay;
        chrome.storage.sync.set({ clickDelayMs: currentClickDelayMs }); // 스토리지에도 저장 (일관성)
        console.log('Click delay updated to:', currentClickDelayMs);
        sendResponse({ status: 'Click delay updated in content script.' });
        // 이 변경은 performRecurringSortClick 내부의 await new Promise에서 다음 실행 시 자동으로 사용됨
        // 별도로 인터벌을 재시작할 필요 없음
      } else {
        sendResponse({ status: 'Error: Invalid click delay.'});
      }
      return true; // 동기 응답임을 명시
    }
  } catch (error) {
    console.error('Error in content script message handler:', error);
    sendResponse({ status: 'Error: ' + error.message });
  }
  
  return true; // 비동기 응답을 위해 항상 true 반환
});

/**
 * 주어진 XPath에 해당하는 요소를 찾아 클릭하는 함수 (단일 클릭용, 참조 저장 안 함)
 */
function clickElementByXPath(xpath, description) {
  try {
    const result = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
    const element = result.singleNodeValue;
    if (element) {
      console.log(`${description} 요소 찾음 (XPath):`, element);
      element.click();
      console.log(`${description} 요소 클릭함 (XPath).`);
      return true;
    }
    console.warn(`XPath에 해당하는 ${description} 요소 없음:`, xpath);
    return false;
  } catch (error) {
    console.error(`${description} 요소 클릭 중 오류 (XPath):`, error, xpath);
    return false;
  }
}

/**
 * 특정 XPath를 가진 요소가 DOM에 나타날 때까지 기다리는 함수
 */
function waitForElement(xpath, description, timeout = 10000) {
  return new Promise((resolve) => {
    const observer = new MutationObserver((mutationsList, obs) => {
      const element = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
      if (element) {
        console.log(`${description} 요소를 찾았습니다.`, element);
        obs.disconnect();
        resolve(element);
      }
    });
    const initialElement = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
    if (initialElement) {
      console.log(`${description} 요소가 이미 존재합니다.`, initialElement);
      resolve(initialElement);
      return;
    }
    observer.observe(document.documentElement, { childList: true, subtree: true });
    console.log(`${description} 요소(${xpath}) 관찰 시작.`);
    setTimeout(() => {
      const element = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
      if (!element) {
        console.warn(`${description} 요소 감지 타임아웃 (${timeout}ms).`);
        observer.disconnect();
        resolve(null);
      } else { // 타임아웃 직전에 찾아졌을 수도 있으므로 resolve
        obs.disconnect();
        resolve(element);
      }
    }, timeout);
  }); 
}

// ... (initialSetupAndClickSortByLatest 함수에서 sortByLatestButtonElement 참조 저장 부분은 유지해도 되나,
// performRecurringSortClick에서 매번 waitForElement로 최신순 버튼을 찾는다면,
// initialSetupAndClickSortByLatest에서 sortByLatestButtonElement = sortButtonFound; 줄은 필수는 아님.
// 하지만 일관성을 위해 남겨두거나, performRecurringSortClick에서만 사용하도록 조정 가능)
/**
 * 초기 설정: 답글 설정 버튼과 최신순 정렬 버튼을 찾아 클릭하고 참조 저장
 * @returns {Promise<boolean>} 성공 여부
 */
// initialSetupAndClickSortByLatest 함수 수정 (sortByLatestButtonElement 저장 부분 명확히)
async function initialSetupAndClickSortByLatest() {
  console.log("최초 설정 시작: '답글 설정' 버튼 및 '최신순 정렬' 버튼 찾기 및 클릭.");
  replySettingsButtonElement = null; // 이전 참조 초기화
  sortByLatestButtonElement = null;  // 이전 참조 초기화

  const replySettingsBtnFound = await waitForElement(REPLY_SETTINGS_BUTTON_XPATH, "'답글 설정' 버튼", 7000);
  if (!replySettingsBtnFound) {
    console.warn("최초 설정 실패: '답글 설정' 버튼을 찾을 수 없습니다.");
    return false;
  }
  replySettingsButtonElement = replySettingsBtnFound;
  console.log("'답글 설정' 버튼 찾음 및 참조 저장:", replySettingsButtonElement);

  try {
    replySettingsButtonElement.click();
    console.log("'답글 설정' 버튼 클릭 성공.");
  } catch (e) {
    console.error("'답글 설정' 버튼 클릭 중 오류:", e);
    replySettingsButtonElement = null;
    return false;
  }

  console.log("'답글 설정 팝업/모달' 대기 중...");
  const modalElement = await waitForElement(MODAL_XPATH, "답글 설정 팝업/모달", 7000);
  if (!modalElement) {
    console.warn("최초 설정 실패: '답글 설정 팝업/모달'이 나타나지 않음.");
    return false;
  }
  console.log("'답글 설정 팝업/모달' 나타남.");

  console.log("'최신순 정렬 버튼' 대기 중...");
  const sortButtonFound = await waitForElement(SORT_BY_LATEST_BUTTON_XPATH, "최신순 정렬 버튼", 5000);
  if (!sortButtonFound) {
    console.warn("최초 설정 실패: '최신순 정렬 버튼'을 모달 내에서 찾지 못함.");
    return false;
  }
  // sortByLatestButtonElement = sortButtonFound; // 반복 시 매번 찾으므로, 여기서의 저장은 선택적
  console.log("'최신순 정렬 버튼' 찾음:", sortButtonFound);

  try {
    sortButtonFound.click(); // 찾은 버튼을 바로 클릭
    console.log("최초 설정: '최신순 정렬 버튼' 클릭 성공.");
    // 초기 설정 시에는 sortByLatestButtonElement에 할당할 필요가 없을 수 있음 (반복 시 매번 찾으므로)
    // 하지만, 만약 초기 설정 후 바로 다음 반복 턴에 이 참조를 쓰고 싶다면 할당.
    // 여기서는 performRecurringSortClick이 매번 찾으므로, 이 할당은 생략 가능.
    return true;
  } catch (e) {
    console.error("최초 설정 중 '최신순 정렬 버튼' 클릭 오류:", e);
    return false;
  }
}

/**
 * 반복 작업: 저장된 '답글 설정' 버튼과 '최신순 정렬' 버튼을 차례로 클릭
 */
async function performRecurringSortClick() {
  if (!masterOn) {
    console.log('반복 정렬 중지: Master OFF.');
    if (refreshIntervalId) clearInterval(refreshIntervalId);
    refreshIntervalId = null;
    return;
  }

  // 스페이스 청취 중인지 확인
  if (!isUserInSpace()) {
    console.log('반복 정렬 중지: 스페이스를 청취 중이 아닙니다.');
    stopContentScriptFeatures();
    return;
  }

  console.log(`반복 정렬 실행 (주기: ${currentRefreshInterval}초, 스페이스 청취 중 확인됨)`);

  const isReplySettingsButtonValid = replySettingsButtonElement && document.body.contains(replySettingsButtonElement);
  // sortByLatestButtonElement는 매번 다시 찾으므로, 여기서는 replySettingsButtonElement만 주로 확인
  // 또는 initialSetup에서 둘 다 설정되었는지 확인하는 플래그를 사용할 수도 있음.

  if (isReplySettingsButtonValid) { // 답글 설정 버튼 참조가 우선 유효해야 함
    console.log("저장된 '답글 설정' 버튼 참조로 순차적 클릭 시도...");
    try {
      console.log("1. '답글 설정' 버튼 클릭 (반복)");
      replySettingsButtonElement.click();

      console.log(`${currentClickDelayMs}ms 대기 (반복)...`); // 변수 사용
      await new Promise(resolve => setTimeout(resolve, currentClickDelayMs)); // 변수 사용

      // 모달이 열린 후 '최신순 정렬' 버튼을 매번 XPath로 다시 찾아서 클릭
      console.log("'최신순 정렬 버튼' XPath로 찾기 시도 (반복)...");
      const sortButtonFound = await waitForElement(SORT_BY_LATEST_BUTTON_XPATH, "최신순 정렬 버튼 (반복)", 5000);

      if (sortButtonFound) {
        console.log("2. '최신순 정렬' 버튼 클릭 (반복)");
        sortButtonFound.click();
        console.log("'최신순 정렬' 클릭 성공 (반복).");
      } else {
        console.warn("'최신순 정렬' 버튼을 모달 내에서 찾지 못함 (반복). 재설정 필요할 수 있음.");
        // 이 경우, 다음 턴에 isReplySettingsButtonValid는 true일 수 있으나,
        // 여기서 문제가 계속되면 결국 replySettingsButtonElement도 유효하지 않게 될 수 있음 (페이지 변경 등)
        // 또는, 여기서 바로 재설정을 시도하도록 유도할 수 있음.
        // 예를 들어, replySettingsButtonElement = null; 로 설정하여 다음 턴에 재설정 로직을 타도록 함.
        // 하지만 현재는 재설정 로직은 replySettingsButtonElement가 없을 때 타도록 되어 있음.
      }
    } catch (e) {
      console.error("저장된 버튼 순차적 클릭 중 오류 (반복):", e);
      // 오류 발생 시, 버튼 참조를 무효화하여 다음 턴에 재설정 시도
      replySettingsButtonElement = null;
      sortByLatestButtonElement = null; // sortByLatestButtonElement는 이미 매번 찾으므로 영향 적음
    }
  } else {
    console.log("'답글 설정' 버튼 참조가 없거나 유효하지 않음. 전체 재설정 시도...");
    const setupSuccess = await initialSetupAndClickSortByLatest();
    if (setupSuccess) {
      console.log("버튼 재설정 및 첫 순차 클릭 성공.");
    } else {
      console.warn("버튼 재설정 실패. 페이지 유효성 검사 및 자동 OFF 조건 확인.");
      // 재설정 실패 시 페이지 유효성 검사
      const isTwitterSite = window.location.hostname === 'twitter.com' || window.location.hostname === 'x.com';
      const isStatusPage = window.location.pathname.includes('status');

      if (!isTwitterSite || !isStatusPage) {
        console.warn("재설정 실패했고, 현재 페이지가 트위터/X의 status 페이지가 아닙니다. 자동 새로고침 기능을 중지하고 마스터 버튼을 OFF합니다.");
        masterOn = false; // 로컬 상태 변경
        chrome.storage.sync.set({ masterOn: false }, () => { // 스토리지에 상태 저장
          console.log("마스터 상태가 스토리지에 OFF로 업데이트되었습니다. 팝업은 다음 열릴 때 이 상태를 반영합니다.");
        });
        stopContentScriptFeatures(); // 인터벌 중지 및 관련 기능 정리
      } else {
        console.log("페이지는 유효하나 버튼 재설정에 실패했습니다. 다음 주기에 다시 시도합니다.");
      }
    }
  }
}

/**
 * 주 기능 로직: 스크롤, 초기 버튼 설정 및 반복 클릭 인터벌 시작
 */
async function mainFeatureLogic() {
  if (!masterOn) {
    console.log('기능 실행 안 함: Master OFF.');
    return;
  }

  // 스페이스 청취 중인지 확인
  if (!isUserInSpace()) {
    console.log('스페이스를 청취 중이 아닙니다. 자동 정렬 기능 비활성.');
    stopContentScriptFeatures();
    return;
  }

  if (window.location.hostname === 'twitter.com' || window.location.hostname === 'x.com') {
    if (window.location.pathname.includes('status')) {
      console.log('트윗 상세 페이지 감지 및 스페이스 청취 중 확인됨. 답글 로드 대기...');
      // PAGE_VALIDATION 상태는 여기서 유효함
      waitForTweetsAndReplies(async () => {
        if (!masterOn) {
          return;
        }
        
        // 스페이스 청취 상태 재확인
        if (!isUserInSpace()) {
          console.log('답글 로드 후 스페이스 청취 상태가 아님. 기능 중지.');
          stopContentScriptFeatures();
          return;
        }
        
        console.log('답글 로드 완료 및 스페이스 청취 중 재확인됨. 스크롤 및 버튼 설정 시작...');
        
        // 500픽셀 한 번 스크롤
        if (!masterOn) { console.log('스크롤 전 Master OFF. 중단.'); return; }
        console.log('답글에 대한 설정 버튼을 출력하기 위해 500픽셀 스크롤을 시행합니다.');
        window.scrollBy(0, 500);
        await new Promise(res => setTimeout(res, 300)); // 스크롤 후 DOM 업데이트를 위한 약간의 대기

        if (!masterOn) { console.log('스크롤 후 Master OFF. 중단.'); return; }
        window.scrollTo(0, 0);
        console.log('맨 위로 스크롤 완료.');

        if (masterOn) {
          const initialSetupSuccess = await initialSetupAndClickSortByLatest();
          if (initialSetupSuccess) {
            console.log("최초 버튼 설정 및 순차 클릭 성공.");
          } else {
            console.warn("최초 버튼 설정 실패. 반복 메커니즘이 재시도할 것입니다.");
          }

          if (masterOn) {
            if (refreshIntervalId) clearInterval(refreshIntervalId);
            refreshIntervalId = setInterval(performRecurringSortClick, currentRefreshInterval * 1000);
            console.log(`순차적 버튼 클릭 반복 인터벌 시작 (주기: ${currentRefreshInterval}초)`);
          }
        }
      });
    } else {
      console.log('트윗 상세 페이지 아님. 자동 정렬 기능 비활성.');
      stopContentScriptFeatures();
    }
  } else {
    console.log('트위터/X 아님. 자동 정렬 기능 비활성.');
    stopContentScriptFeatures();
  }
}

/**
 * 확장 기능 시작 시 호출
 */
function startContentScriptFeatures() {
  console.log('콘텐츠 스크립트 기능 시작 중...');
  if (refreshIntervalId) {
    clearInterval(refreshIntervalId);
    refreshIntervalId = null;
  }
  stopConditionChecking(); // 기능이 시작되므로 조건 확인 중지
  replySettingsButtonElement = null; // 시작 시 참조 초기화
  sortByLatestButtonElement = null;  // 시작 시 참조 초기화
  mainFeatureLogic();
}

/**
 * 확장 기능 중지 시 호출
 */
function stopContentScriptFeatures() {
  console.log('콘텐츠 스크립트 기능 중지 중...');
  if (refreshIntervalId) {
    clearInterval(refreshIntervalId);
    refreshIntervalId = null;
    console.log('순차적 버튼 클릭 반복 인터벌 중지됨.');
  }
  stopConditionChecking(); // 조건 확인도 중지
  replySettingsButtonElement = null;
  sortByLatestButtonElement = null;
}

// 페이지 로드 시 초기화
document.addEventListener('DOMContentLoaded', function() {
  console.log('페이지 로드 완료 - 초기화 시작');
  // 마스터가 ON 상태라면 URL 변경 감지 시작
  if (masterOn) {
    startURLChangeDetection();
  }
});

// 페이지가 이미 로드된 경우를 위한 대비책
if (document.readyState === 'loading') {
  // 아직 로딩 중이면 DOMContentLoaded 이벤트를 기다림
} else {
  // 이미 로드 완료된 경우 즉시 실행
  console.log('페이지 이미 로드됨 - 초기화 시작');
  if (masterOn) {
    startURLChangeDetection();
  }
}