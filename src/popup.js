'use strict';

import './popup.css';

(function() {
  // We will make use of Storage API to get and store `count` value
  // More information on Storage API can we found at
  // https://developer.chrome.com/extensions/storage

  // To get storage access, we have to mention it in `permissions` property of manifest.json file
  // More information on Permissions can we found at
  // https://developer.chrome.com/extensions/declare_permissions
  
  // 새로고침 주기 저장 및 복원
  function setupRefreshInterval() {
    const input = document.getElementById('refreshInterval');
    const applyBtn = document.getElementById('applyRefreshIntervalBtn');

    // 저장된 값 불러오기
    chrome.storage.sync.get(['refreshInterval'], result => {
      if (typeof result.refreshInterval === 'number') {
        input.value = result.refreshInterval;
      }
    });

    // 값 변경 시 저장 (기존 로직 유지)
    input.addEventListener('change', () => {
      let value = parseInt(input.value, 10);
      if (isNaN(value) || value < 1) value = 1;
      if (value > 3600) value = 3600;
      input.value = value; // Ensure input reflects validated value
      chrome.storage.sync.set({ refreshInterval: value });
    });

    // "적용" 버튼 클릭 시 contentScript로 전송
    applyBtn.addEventListener('click', () => {
      let value = parseInt(input.value, 10);
      if (isNaN(value) || value < 1) value = 1;
      if (value > 3600) value = 3600;
      input.value = value; // Ensure input reflects validated value before sending

      // 먼저 storage에 저장 (input.eventListener('change')가 실행되지 않았을 수 있으므로)
      chrome.storage.sync.set({ refreshInterval: value }, () => {
        // background.js를 통해 contentScript.js에 메시지 전달
        chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
          if (tabs[0]?.id) {
            chrome.runtime.sendMessage({
              type: 'SET_REFRESH_INTERVAL_BG',
              payload: {
                tabId: tabs[0].id,
                interval: value,
              },
            });
          }
        });
      });
    });
  }

  // 페이지 상태 확인 함수
  function checkPageStatus() {
    chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
      if (tabs[0]?.id) {
        chrome.runtime.sendMessage({
          type: 'GET_PAGE_STATUS_BG',
          payload: {
            tabId: tabs[0].id,
          },
        }, response => {
          // response 체크 개선
          if (chrome.runtime.lastError) {
            console.log('Runtime error in checkPageStatus:', chrome.runtime.lastError.message);
            updateStatusDisplay({ status: 'WAITING_FOR_TWITTER', message: '트위터 접속 대기 중' });
          } else if (response && typeof response === 'object') {
            updateStatusDisplay(response);
          } else {
            // response가 없거나 잘못된 경우 기본값 사용
            console.log('No valid response received, using default status');
            updateStatusDisplay({ status: 'WAITING_FOR_TWITTER', message: '트위터 접속 대기 중' });
          }
        });
      } else {
        // 탭 정보가 없는 경우
        updateStatusDisplay({ status: 'WAITING_FOR_TWITTER', message: '트위터 접속 대기 중' });
      }
    });
  }

  // 상태 표시 업데이트 함수
  function updateStatusDisplay(pageStatus) {
    const statusTextElement = document.getElementById('statusText');
    const loadingSpinnerElement = document.getElementById('loadingSpinner');
    const masterBtn = document.getElementById('masterToggleBtn');
    const isMasterOn = !masterBtn.classList.contains('off');

    if (!isMasterOn) {
      // 마스터가 OFF인 경우
      statusTextElement.textContent = '상태: 비활성화됨';
      loadingSpinnerElement.style.display = 'none';
    } else {
      // 마스터가 ON인 경우, 페이지 상태에 따라 표시
      switch (pageStatus.status) {
        case 'WAITING_FOR_TWITTER':
          statusTextElement.textContent = '트위터 접속 대기 중';
          loadingSpinnerElement.style.display = 'block';
          break;
        case 'WAITING_FOR_STATUS_PAGE':
          statusTextElement.textContent = '트윗 상세 페이지 대기 중';
          loadingSpinnerElement.style.display = 'block';
          break;
        case 'WAITING_FOR_SPACE':
          statusTextElement.textContent = '스페이스 청취 대기 중';
          loadingSpinnerElement.style.display = 'block';
          break;
        case 'READY':
          statusTextElement.textContent = '상태: 활성화됨';
          loadingSpinnerElement.style.display = 'block';
          break;
        default:
          statusTextElement.textContent = pageStatus.message || '상태 확인 중...';
          loadingSpinnerElement.style.display = 'block';
      }
    }
  }

  // 마스터 ON/OFF 버튼 상태 저장 및 UI 처리
  function setupMasterToggle() {
    const masterBtn = document.getElementById('masterToggleBtn');
    const statusTextElement = document.getElementById('statusText');
    const loadingSpinnerElement = document.getElementById('loadingSpinner');

    // Function to update master button UI only
    function updateMasterButtonUI(isOn) {
      masterBtn.textContent = isOn ? 'ON' : 'OFF';
      masterBtn.classList.toggle('off', !isOn);
    }

    // 저장된 상태 불러오기 및 초기 UI 설정
    chrome.storage.sync.get(['masterOn'], result => {
      const isOn = result.masterOn === true; // 기본값 false (OFF)
      updateMasterButtonUI(isOn);
      
      // 초기 상태 확인
      if (isOn) {
        checkPageStatus();
      } else {
        statusTextElement.textContent = '상태: 비활성화됨';
        loadingSpinnerElement.style.display = 'none';
      }
    });

    masterBtn.addEventListener('click', () => {
      // 현재 UI 상태(버튼의 'off' 클래스 유무)를 기반으로 다음 상태 결정
      const currentIsOn = !masterBtn.classList.contains('off');
      const newIsOn = !currentIsOn;

      updateMasterButtonUI(newIsOn); // 버튼 UI 즉시 업데이트

      chrome.storage.sync.set({ masterOn: newIsOn }, () => {
        // contentScript에 마스터 상태 전달
        chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
          if (tabs[0]?.id) {
            chrome.runtime.sendMessage({
              type: 'MASTER_TOGGLE_BG',
              payload: {
                tabId: tabs[0].id,
                isOn: newIsOn,
              },
            }, response => {
              // 응답 처리 개선
              console.log('Master toggle response:', response);
              
              // runtime 에러 체크
              if (chrome.runtime.lastError) {
                console.log('Runtime error in master toggle:', chrome.runtime.lastError.message);
                // 에러가 발생한 경우 페이지 상태를 직접 확인
                if (newIsOn) {
                  setTimeout(() => checkPageStatus(), 200);
                } else {
                  statusTextElement.textContent = '상태: 비활성화됨';
                  loadingSpinnerElement.style.display = 'none';
                }
                return;
              }

              // response가 유효한 객체인지 확인
              if (response && typeof response === 'object') {
                if (response.pageStatus) {
                  // contentScript로부터 페이지 상태를 받은 경우
                  updateStatusDisplay(response.pageStatus);
                } else if (response.error) {
                  // contentScript 통신 오류가 발생한 경우
                  console.log('Content script communication error:', response.error);
                  // 페이지 상태를 직접 확인
                  if (newIsOn) {
                    setTimeout(() => checkPageStatus(), 200);
                  } else {
                    statusTextElement.textContent = '상태: 비활성화됨';
                    loadingSpinnerElement.style.display = 'none';
                  }
                } else if (newIsOn) {
                  // ON으로 설정했지만 명확한 응답이 없는 경우 페이지 상태 확인
                  setTimeout(() => checkPageStatus(), 200);
                } else {
                  // OFF로 설정한 경우
                  statusTextElement.textContent = '상태: 비활성화됨';
                  loadingSpinnerElement.style.display = 'none';
                }
              } else {
                // response가 없거나 잘못된 경우
                console.log('Invalid or no response received from master toggle');
                if (newIsOn) {
                  setTimeout(() => checkPageStatus(), 200);
                } else {
                  statusTextElement.textContent = '상태: 비활성화됨';
                  loadingSpinnerElement.style.display = 'none';
                }
              }
            });
          }
        });
      });
    });

    // 실시간 상태 업데이트를 위한 주기적 확인 (마스터가 ON일 때만)
    setInterval(() => {
      const currentIsOn = !masterBtn.classList.contains('off');
      if (currentIsOn) {
        checkPageStatus();
      }
      // 마스터가 OFF일 때는 상태 확인을 하지 않음 (로그 스팸 방지)
    }, 1000); // 1초마다 확인 (더 빠른 반응성)
  }

  // 클릭 간 대기 시간 설정
  function setupClickDelay() {
    const input = document.getElementById('clickDelay');
    const applyBtn = document.getElementById('applyClickDelayBtn');

    // 저장된 값 불러오기
    chrome.storage.sync.get(['clickDelayMs'], result => {
      if (typeof result.clickDelayMs === 'number') {
        input.value = result.clickDelayMs;
      }
    });

    // 값 변경 시 즉시 저장 (input 이벤트 사용)
    input.addEventListener('input', () => {
      let value = parseInt(input.value, 10);
      if (isNaN(value) || value < 0) value = 0;
      if (value > 10000) value = 10000;
      // input.value = value; // 사용자가 입력 중일 때는 값을 강제로 바꾸지 않을 수 있음. 적용 시점에 최종 검증.
    });
    
    applyBtn.addEventListener('click', () => {
      let value = parseInt(input.value, 10);
      if (isNaN(value) || value < 0) value = 0;
      if (value > 10000) value = 10000;
      input.value = value; // 최종 검증된 값으로 input 업데이트

      chrome.storage.sync.set({ clickDelayMs: value }, () => {
        chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
          if (tabs[0]?.id) {
            chrome.runtime.sendMessage({
              type: 'SET_CLICK_DELAY_BG',
              payload: {
                tabId: tabs[0].id,
                delay: value,
              },
            });
          }
        });
      });
    });
  }

  // 테마 적용 함수
  function applyTheme(theme) {
    const docElement = document.documentElement;
    if (theme === 'system') {
      docElement.removeAttribute('data-theme');
      // CSS media query (prefers-color-scheme) will handle this
    } else {
      docElement.setAttribute('data-theme', theme);
    }
  }

  // 다크 모드 설정
  function setupDarkModeToggle() {
    const themeSelector = document.getElementById('themeSelector');
    
    // 저장된 테마 불러오기 및 적용
    chrome.storage.sync.get(['theme'], result => {
      const currentTheme = result.theme || 'system'; // 기본값 'system'
      themeSelector.value = currentTheme;
      applyTheme(currentTheme);
    });

    themeSelector.addEventListener('change', () => {
      const selectedTheme = themeSelector.value;
      chrome.storage.sync.set({ theme: selectedTheme }, () => {
        applyTheme(selectedTheme);
      });
    });

    // 시스템 테마 변경 감지 (선택 사항: 사용자가 '시스템 설정'을 선택했을 때만 활성화)
    // 이 부분은 팝업이 열려있을 때만 동작하며, 팝업이 닫히면 리스너가 사라집니다.
    // 지속적인 시스템 테마 감지를 원한다면 background script에서의 처리가 필요할 수 있습니다.
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
      if (themeSelector.value === 'system') {
        applyTheme('system'); // Re-apply to trigger CSS media query evaluation
      }
    });
  }


  document.addEventListener('DOMContentLoaded', () => {
    //restoreCounter();
    setupMasterToggle();
    setupRefreshInterval();
    setupClickDelay(); // 새 함수 호출 추가
    setupDarkModeToggle(); // 다크 모드 설정 함수 호출
  });

  // Communicate with background file by sending a message
  chrome.runtime.sendMessage(
    {
      type: 'GREETINGS',
      payload: {
        message: 'Hello, my name is Pop. I am from Popup.',
      },
    },
    response => {
      // 응답 처리 개선
      if (chrome.runtime.lastError) {
        console.log('Runtime error in greetings:', chrome.runtime.lastError.message);
      } else if (response && response.message) {
        console.log(response.message);
      } else {
        console.log('Greetings sent but no valid response received');
      }
    }
  );
})();
