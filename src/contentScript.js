'use strict';

// Content script for X (Twitter) Auto Refresh Extension
// Handles automatic detection and interaction with X Spaces

class XSpaceAutoRefresh {  constructor() {
    this.isActive = false;
    this.detectionInterval = null;
    this.refreshInterval = null;
    this.refreshIntervalMs = 10000; // 기본 10초
    this.clickDelayMs = 700; // 기본 700ms
    this.tabId = null;
    
    // XPath 정의
    this.xpaths = {
      spaceParticipationStatus: '/html/body/div[1]/div/div/div[2]/main/div/div/div/div[1]/div/section/div/div/div[1]/div/div/article/div/div/div[3]/div[2]/div/div/div/div/button/div/div[4]/button/div/span/span',
      replySettingsButton: '//*[@id="react-root"]/div/div/div[2]/main/div/div/div/div[1]/div/div[1]/div[1]/div/div/div/div/div/div[3]/div/button[2]',
      latestSortButton: '//*[@id="layers"]/div[2]/div/div/div/div[2]/div/div[3]/div/div/div/div[3]'
    };

    this.init();
  }
  init() {
    // 현재 탭 ID 가져오기
    this.getCurrentTabId();
    
    // storage에서 설정 값 로드
    this.loadSettings();
    
    // 메시지 리스너 설정
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      this.handleMessage(message, sender, sendResponse);
      return true;
    });

    console.log('X Space Auto Refresh initialized for tab:', this.tabId);
  }

  getCurrentTabId() {
    // 현재 탭 ID는 chrome.tabs API를 통해 직접 접근할 수 없으므로
    // URL과 timestamp를 조합하여 고유 식별자 생성
    this.tabId = `${window.location.hostname}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  getTabSettingKey(key) {
    return `${key}_tab_${this.tabId}`;
  }

  loadSettings() {
    // 탭별 설정과 전역 설정을 함께 로드
    const tabMasterKey = this.getTabSettingKey('masterOn');
    chrome.storage.sync.get([tabMasterKey, 'refreshInterval', 'clickDelayMs'], (result) => {
      this.isActive = result[tabMasterKey] || false;
      this.refreshIntervalMs = (result.refreshInterval || 10) * 1000;
      this.clickDelayMs = result.clickDelayMs || 700;
      
      console.log(`Tab ${this.tabId} loaded settings:`, {
        isActive: this.isActive,
        refreshIntervalMs: this.refreshIntervalMs,
        clickDelayMs: this.clickDelayMs
      });
      
      if (this.isActive) {
        this.startDetection();
      }
    });
  }  
  
  handleMessage(message, sender, sendResponse) {
    
    switch (message.type) {
      case 'TOGGLE_MASTER':
        this.isActive = message.payload.isOn;
        // 탭별 설정으로 저장
        const tabMasterKey = this.getTabSettingKey('masterOn');
        chrome.storage.sync.set({ [tabMasterKey]: this.isActive });
        
        console.log(`Tab ${this.tabId} master toggled to:`, this.isActive);
        if (this.isActive) {
          this.startDetection();
        } else {
          this.stopDetection();
        }
        sendResponse({ status: 'success' });
        break;

      case 'SET_REFRESH_INTERVAL':
        this.refreshIntervalMs = message.payload.interval * 1000;
        // 전역 설정으로 저장 (모든 탭에서 공유)
        chrome.storage.sync.set({ refreshInterval: message.payload.interval });
        console.log(`Tab ${this.tabId} refresh interval set to:`, this.refreshIntervalMs);
        
        // 현재 실행 중인 새로고침 주기가 있다면 재시작
        if (this.refreshInterval) {
          clearInterval(this.refreshInterval);
          this.refreshInterval = null;
          if (this.isActive && this.isOnXSite() && this.isOnSpaceTweet() && this.isListeningToSpace()) {
            this.startRefreshCycle();
          }
        }
        sendResponse({ status: 'success' });
        break;

      case 'SET_CLICK_DELAY':
        this.clickDelayMs = message.payload.delay;
        // 전역 설정으로 저장 (모든 탭에서 공유)
        chrome.storage.sync.set({ clickDelayMs: this.clickDelayMs });
        console.log(`Tab ${this.tabId} click delay set to:`, this.clickDelayMs);
        sendResponse({ status: 'success' });
        break;

      case 'GET_STATUS':
        const status = this.getCurrentStatus();
        console.log(`Tab ${this.tabId} sending status:`, status);
        sendResponse({ status: 'success', data: status });
        break;

      default:
        console.log(`Tab ${this.tabId} unknown message type:`, message.type);
        sendResponse({ status: 'unknown_message_type' });
    }
  }
  getCurrentStatus() {
    const isOnXSite = this.isOnXSite();
    const isOnSpaceTweet = this.isOnSpaceTweet();
    const isListeningToSpace = this.isListeningToSpace();
    const replyCount = this.getReplyCount();

    return {
      isActive: this.isActive,
      isOnXSite,
      isOnSpaceTweet,
      isListeningToSpace,
      replyCount,
      url: window.location.href,
      tabId: this.tabId
    };
  }
  startDetection() {
    this.stopDetection(); // 기존 인터벌 정리
    
    // 1초마다 감지 실행
    this.detectionInterval = setInterval(() => {
      this.performDetection();
    }, 1000);

    console.log(`Tab ${this.tabId} detection started`);
  }
  stopDetection() {
    if (this.detectionInterval) {
      clearInterval(this.detectionInterval);
      this.detectionInterval = null;
    }
    
    // 탐지 정지 시 새로고침 주기도 정지
    this.stopRefreshCycle();

    console.log(`Tab ${this.tabId} detection stopped`);
  }

  stopRefreshCycle() {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
      console.log(`Tab ${this.tabId} refresh cycle stopped - conditions no longer met`);
    }
  }
  performDetection() {
    // 1. 트위터(X) 사이트 감지
    if (!this.isOnXSite()) {
      this.stopRefreshCycle(); // 다른 사이트로 이동 시 새로고침 정지
      return;
    }

    // 2. 스페이스가 포함된 트윗 상세 게시글 감지
    if (!this.isOnSpaceTweet()) {
      this.stopRefreshCycle(); // 스페이스 트윗이 아닌 페이지로 이동 시 새로고침 정지
      return;
    }

    // 3. 스페이스 청취 중 감지
    if (!this.isListeningToSpace()) {
      this.stopRefreshCycle(); // 스페이스 청취를 중단했을 때 새로고침 정지
      return;
    }

    // 스페이스 청취 중이면 새로고침 주기 시작
    this.startRefreshCycle();
  }

  isOnXSite() {
    return window.location.hostname === 'x.com' || window.location.hostname === 'twitter.com';
  }

  isOnSpaceTweet() {
    // 스페이스 관련 트윗인지 확인 (URL이나 DOM 요소로 판단)
    const url = window.location.href;
    
    // 트윗 상세 페이지인지 확인 (/status/ 포함)
    if (!url.includes('/status/')) {
      return false;
    }

    // 스페이스 관련 요소가 있는지 확인
    const spaceElement = this.getElementByXPath(this.xpaths.spaceParticipationStatus);
    return spaceElement !== null;
  }

  isListeningToSpace() {
    const element = this.getElementByXPath(this.xpaths.spaceParticipationStatus);
    if (!element) {
      return false;
    }
    
    const text = element.textContent.trim();
    return text === '참여했습니다' || text === '일시 정지';
  }

  getReplyCount() {
    // 답글 수를 계산하는 로직 (대략적인 방법)
    const replies = document.querySelectorAll('[data-testid="tweetText"]');
    return replies.length;
  }
  startRefreshCycle() {
    // 이미 새로고침 주기가 실행 중이면 중복 실행 방지
    if (this.refreshInterval) {
      return;
    }

    // 첫 실행은 즉시 (조건 재확인 후)
    if (this.isOnXSite() && this.isOnSpaceTweet() && this.isListeningToSpace()) {
      this.performRefreshActions();
    } else {
      console.log(`Tab ${this.tabId} conditions no longer met, not starting refresh cycle`);
      return;
    }

    // 설정된 주기마다 반복
    this.refreshInterval = setInterval(() => {
      // 매 실행마다 조건 재확인
      if (!this.isActive || !this.isOnXSite() || !this.isOnSpaceTweet() || !this.isListeningToSpace()) {
        console.log(`Tab ${this.tabId} conditions changed during refresh cycle, stopping`);
        this.stopRefreshCycle();
        return;
      }
      this.performRefreshActions();
    }, this.refreshIntervalMs);

    console.log(`Tab ${this.tabId} refresh cycle started with interval: ${this.refreshIntervalMs}ms`);
  }
  async performRefreshActions() {
    try {
      // 실행 전 조건 재확인 (페이지가 변경되었을 수 있음)
      if (!this.isActive || !this.isOnXSite() || !this.isOnSpaceTweet() || !this.isListeningToSpace()) {
        console.log(`Tab ${this.tabId} conditions no longer met during refresh actions, stopping`);
        this.stopRefreshCycle();
        return;
      }

      // 답글이 10개 이상인지 확인
      const replyCount = this.getReplyCount();
      if (replyCount < 10) {
        console.log(`Tab ${this.tabId} reply count (${replyCount}) is less than 10, skipping actions`);
        return;
      }

      console.log(`Tab ${this.tabId} performing refresh actions (Reply count: ${replyCount})`);

      // 1. 500px 스크롤
      window.scrollBy(0, 500);
      console.log(`Tab ${this.tabId} scrolled 500px`);

      // 스크롤 후 조건 재확인
      if (!this.isActive || !this.isOnXSite() || !this.isOnSpaceTweet() || !this.isListeningToSpace()) {
        console.log(`Tab ${this.tabId} conditions changed after scroll, stopping`);
        this.stopRefreshCycle();
        return;
      }

      // 2. 답글 설정 버튼 클릭
      const replySettingsBtn = this.getElementByXPath(this.xpaths.replySettingsButton);
      if (replySettingsBtn) {
        replySettingsBtn.click();
        console.log(`Tab ${this.tabId} reply settings button clicked`);
        
        // 설정된 지연 시간 대기
        await this.sleep(this.clickDelayMs);
        
        // 클릭 후 조건 재확인
        if (!this.isActive || !this.isOnXSite() || !this.isOnSpaceTweet() || !this.isListeningToSpace()) {
          console.log(`Tab ${this.tabId} conditions changed after first click, stopping`);
          this.stopRefreshCycle();
          return;
        }
        
        // 3. 최신순 정렬 버튼 클릭
        const latestSortBtn = this.getElementByXPath(this.xpaths.latestSortButton);
        if (latestSortBtn) {
          latestSortBtn.click();
          console.log(`Tab ${this.tabId} latest sort button clicked`);
        } else {
          console.log(`Tab ${this.tabId} latest sort button not found`);
        }
      } else {
        console.log(`Tab ${this.tabId} reply settings button not found`);
      }

    } catch (error) {
      console.error(`Tab ${this.tabId} error performing refresh actions:`, error);
    }
  }

  getElementByXPath(xpath) {
    const result = document.evaluate(
      xpath,
      document,
      null,
      XPathResult.FIRST_ORDERED_NODE_TYPE,
      null
    );
    return result.singleNodeValue;
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// 인스턴스 생성
const xSpaceAutoRefresh = new XSpaceAutoRefresh();
