'use strict';

/**
 * X (Twitter) Space Auto Refresh Extension Content Script
 * 
 * This class manages automatic detection and interaction with X Spaces:
 * - Detects when user is on X site, Space tweet, and listening to a Space
 * - Automatically scrolls and sorts replies when conditions are met
 * - Supports per-tab independent operation with robust state management
 */
class XSpaceAutoRefresh {
  
  // ================================
  // CONSTANTS AND CONFIGURATION
  // ================================
  
  static CONSTANTS = {
    DETECTION_INTERVAL: 1000,           // 1초마다 상태 감지
    DEFAULT_REFRESH_INTERVAL: 10000,    // 기본 10초 새로고침 주기
    DEFAULT_CLICK_DELAY: 700,           // 기본 700ms 클릭 간 대기
    MIN_REPLY_COUNT: 10,               // 최소 답글 수
    SCROLL_AMOUNT: 500,                // 스크롤 픽셀
    
    // XPath selectors for X (Twitter) elements
    XPATHS: {
      spaceParticipationStatus: '/html/body/div[1]/div/div/div[2]/main/div/div/div/div[1]/div/section/div/div/div[1]/div/div/article/div/div/div[3]/div[2]/div/div/div/div/button/div/div[4]/button/div/span/span',
      replySettingsButton: '//*[@id="react-root"]/div/div/div[2]/main/div/div/div/div[1]/div/div[1]/div[1]/div/div/div/div/div/div[3]/div/button[2]',
      latestSortButton: '//*[@id="layers"]/div[2]/div/div/div/div[2]/div/div[3]/div/div/div/div[3]'
    },
    
    // Expected text content for space participation status
    PARTICIPATION_TEXTS: {
      PARTICIPATING: '참여했습니다',
      PAUSED: '일시 정지'
    }
  };

  // ================================
  // CONSTRUCTOR AND INITIALIZATION
  // ================================

  constructor() {
    this.isActive = false;
    this.detectionInterval = null;
    this.refreshInterval = null;
    this.refreshIntervalMs = XSpaceAutoRefresh.CONSTANTS.DEFAULT_REFRESH_INTERVAL;
    this.clickDelayMs = XSpaceAutoRefresh.CONSTANTS.DEFAULT_CLICK_DELAY;
    this.tabId = null;

    this.initialize();
  }  /**
   * Initialize the extension
   * Sets up tab ID, loads settings, and registers message listeners
   */
  initialize() {
    this.setupMessageListeners();
    this.requestTabIdFromBackground();
    
    this.logInfo('X Space Auto Refresh initializing...');
  }

  /**
   * Request actual tab ID from background script
   */
  requestTabIdFromBackground() {
    chrome.runtime.sendMessage(
      { type: 'GET_TAB_ID' },
      (response) => {
        if (response && response.status === 'success') {
          this.tabId = response.tabId;
          this.logInfo('Tab ID received from background:', this.tabId);
          this.loadSettingsFromStorage();
        } else {
          // Fallback to generated ID if background request fails
          this.generateFallbackTabId();
          this.logWarning('Using fallback tab ID:', this.tabId);
          this.loadSettingsFromStorage();
        }
      }
    );
  }

  /**
   * Generate fallback tab identifier (only used if background request fails)
   * Uses hostname, timestamp, and random string for uniqueness
   */
  generateFallbackTabId() {
    const hostname = window.location.hostname;
    const timestamp = Date.now();
    const randomString = Math.random().toString(36).substr(2, 9);
    this.tabId = `fallback_${hostname}_${timestamp}_${randomString}`;
  }
  /**
   * Get tab-specific storage key
   * @param {string} key - The base key name
   * @returns {string} Tab-specific key
   */
  getTabSettingKey(key) {
    if (!this.tabId) {
      this.logWarning('Tab ID not set when creating tab setting key');
      return `${key}_tab_unknown`;
    }
    return `${key}_tab_${this.tabId}`;
  }

  // ================================
  // SETTINGS MANAGEMENT
  // ================================
  /**
   * Load extension settings from Chrome storage
   */
  loadSettingsFromStorage() {
    // 탭 ID가 설정되지 않았으면 로드하지 않음
    if (!this.tabId) {
      this.logWarning('Tab ID not set, skipping settings load');
      return;
    }

    const tabMasterKey = this.getTabSettingKey('masterOn');
    const settingsToLoad = [tabMasterKey, 'refreshInterval', 'clickDelayMs'];
    
    chrome.storage.sync.get(settingsToLoad, (result) => {
      this.isActive = result[tabMasterKey] || false;
      this.refreshIntervalMs = (result.refreshInterval || 10) * 1000;
      this.clickDelayMs = result.clickDelayMs || XSpaceAutoRefresh.CONSTANTS.DEFAULT_CLICK_DELAY;
      
      this.logCurrentSettings();
      
      if (this.isActive) {
        this.startDetection();
      }
    });
  }

  /**
   * Log current extension settings
   */
  logCurrentSettings() {
    this.logInfo('Loaded settings:', {
      isActive: this.isActive,
      refreshIntervalMs: this.refreshIntervalMs,
      clickDelayMs: this.clickDelayMs
    });
  }

  // ================================
  // MESSAGE HANDLING
  // ================================

  /**
   * Setup Chrome runtime message listeners
   */
  setupMessageListeners() {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      this.handleMessage(message, sender, sendResponse);
      return true; // Keep message channel open for async responses
    });
  }  /**
   * Handle incoming messages from popup or background script
   * @param {Object} message - The message object
   * @param {Object} sender - The sender information
   * @param {Function} sendResponse - Response callback
   */
  handleMessage(message, sender, sendResponse) {
    const { type, payload } = message;
    
    try {
      switch (type) {
        case 'TAB_ID_UPDATE':
          this.handleTabIdUpdate(payload, sendResponse);
          break;

        case 'TOGGLE_MASTER':
          this.handleToggleMaster(payload, sendResponse);
          break;

        case 'SET_REFRESH_INTERVAL':
          this.handleSetRefreshInterval(payload, sendResponse);
          break;

        case 'SET_CLICK_DELAY':
          this.handleSetClickDelay(payload, sendResponse);
          break;

        case 'GET_STATUS':
          this.handleGetStatus(sendResponse);
          break;

        default:
          this.logWarning('Unknown message type:', type);
          sendResponse({ status: 'unknown_message_type' });
      }
    } catch (error) {
      this.logError('Error handling message:', error);
      sendResponse({ status: 'error', error: error.message });
    }
  }

  /**
   * Handle tab ID update from background script
   * @param {Object} payload - Message payload
   * @param {Function} sendResponse - Response callback
   */
  handleTabIdUpdate(payload, sendResponse) {
    const newTabId = payload.tabId;
    
    // 탭 ID가 변경되었는지 확인
    if (this.tabId !== newTabId) {
      const oldTabId = this.tabId;
      this.tabId = newTabId;
      
      this.logInfo(`Tab ID updated from ${oldTabId} to ${newTabId}`);
      
      // 기존 탭 ID로 저장된 설정이 있다면 새 탭 ID로 마이그레이션
      if (oldTabId && oldTabId.startsWith('fallback_')) {
        this.migrateTabSettings(oldTabId, newTabId);
      }
      
      // 새 탭 ID로 설정 다시 로드
      this.loadSettingsFromStorage();
    }
    
    sendResponse({ status: 'success' });
  }

  /**
   * Migrate settings from old tab ID to new tab ID
   * @param {string} oldTabId - Old tab identifier
   * @param {string} newTabId - New tab identifier
   */
  migrateTabSettings(oldTabId, newTabId) {
    const oldTabKey = `masterOn_tab_${oldTabId}`;
    const newTabKey = `masterOn_tab_${newTabId}`;
    
    chrome.storage.sync.get([oldTabKey], (result) => {
      if (result[oldTabKey] !== undefined) {
        // 새 키로 설정 저장
        chrome.storage.sync.set({ [newTabKey]: result[oldTabKey] });
        // 이전 키 삭제
        chrome.storage.sync.remove([oldTabKey]);
        
        this.logInfo(`Migrated settings from ${oldTabId} to ${newTabId}`);
      }
    });
  }

  /**
   * Handle master toggle message
   * @param {Object} payload - Message payload
   * @param {Function} sendResponse - Response callback
   */
  handleToggleMaster(payload, sendResponse) {
    this.isActive = payload.isOn;
    
    // Save as tab-specific setting
    const tabMasterKey = this.getTabSettingKey('masterOn');
    chrome.storage.sync.set({ [tabMasterKey]: this.isActive });
    
    this.logInfo('Master toggled to:', this.isActive);
    
    if (this.isActive) {
      this.startDetection();
    } else {
      this.stopDetection();
    }
    
    sendResponse({ status: 'success' });
  }

  /**
   * Handle refresh interval setting message
   * @param {Object} payload - Message payload
   * @param {Function} sendResponse - Response callback
   */
  handleSetRefreshInterval(payload, sendResponse) {
    this.refreshIntervalMs = payload.interval * 1000;
    
    // Save as global setting (shared across all tabs)
    chrome.storage.sync.set({ refreshInterval: payload.interval });
    this.logInfo('Refresh interval set to:', this.refreshIntervalMs);
    
    // Restart refresh cycle if needed with new interval
    this.restartRefreshCycleIfNeeded();
    
    sendResponse({ status: 'success' });
  }

  /**
   * Handle click delay setting message
   * @param {Object} payload - Message payload
   * @param {Function} sendResponse - Response callback
   */
  handleSetClickDelay(payload, sendResponse) {
    this.clickDelayMs = payload.delay;
    
    // Save as global setting (shared across all tabs)
    chrome.storage.sync.set({ clickDelayMs: this.clickDelayMs });
    this.logInfo('Click delay set to:', this.clickDelayMs);
    
    sendResponse({ status: 'success' });
  }

  /**
   * Handle status request message
   * @param {Function} sendResponse - Response callback
   */
  handleGetStatus(sendResponse) {
    const status = this.getCurrentStatus();
    this.logInfo('Sending status:', status);
    sendResponse({ status: 'success', data: status });
  }

  // ================================
  // DETECTION AND STATE MANAGEMENT
  // ================================

  /**
   * Start the detection cycle
   * Begins monitoring page state at regular intervals
   */
  startDetection() {
    this.stopDetection(); // Clear any existing interval
    
    // Start detection at regular intervals
    this.detectionInterval = setInterval(() => {
      this.performDetection();
    }, XSpaceAutoRefresh.CONSTANTS.DETECTION_INTERVAL);

    this.logInfo('Detection started');
  }

  /**
   * Stop the detection cycle
   * Also stops any active refresh cycles
   */
  stopDetection() {
    if (this.detectionInterval) {
      clearInterval(this.detectionInterval);
      this.detectionInterval = null;
    }
    
    // Stop refresh cycle when detection stops
    this.stopRefreshCycle();

    this.logInfo('Detection stopped');
  }  /**
   * Perform detection cycle
   * Checks all conditions and manages refresh cycle accordingly
   */
  performDetection() {
    // Stop refresh cycle if not on X site
    if (!this.isOnXSite()) {
      this.stopRefreshCycle();
      return;
    }

    // Stop refresh cycle if not on Space tweet
    if (!this.isOnSpaceTweet()) {
      this.stopRefreshCycle();
      return;
    }

    // Stop refresh cycle if not listening to Space
    if (!this.isListeningToSpace()) {
      this.stopRefreshCycle();
      return;
    }

    // All conditions met - start refresh cycle
    this.startRefreshCycle();
  }

  /**
   * Get current extension status
   * @returns {Object} Current status information
   */
  getCurrentStatus() {
    return {
      isActive: this.isActive,
      isOnXSite: this.isOnXSite(),
      isOnSpaceTweet: this.isOnSpaceTweet(),
      isListeningToSpace: this.isListeningToSpace(),
      replyCount: this.getReplyCount(),
      url: window.location.href,
      tabId: this.tabId
    };
  }

  /**
   * Restart refresh cycle if needed with new settings
   */
  restartRefreshCycleIfNeeded() {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
      
      if (this.shouldStartRefreshCycle()) {
        this.startRefreshCycle();
      }
    }
  }

  /**
   * Check if refresh cycle should be started
   * @returns {boolean} True if all conditions are met
   */
  shouldStartRefreshCycle() {
    return this.isActive && 
           this.isOnXSite() && 
           this.isOnSpaceTweet() && 
           this.isListeningToSpace();
  }

  /**
   * Stop the refresh cycle
   */
  stopRefreshCycle() {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
      this.logInfo('Refresh cycle stopped - conditions no longer met');
    }
  }

  // ================================
  // PAGE DETECTION METHODS
  // ================================

  /**
   * Check if currently on X (Twitter) site
   * @returns {boolean} True if on X site
   */
  isOnXSite() {
    const hostname = window.location.hostname;
    return hostname === 'x.com' || hostname === 'twitter.com';
  }

  /**
   * Check if currently on a Space tweet page
   * @returns {boolean} True if on Space tweet
   */
  isOnSpaceTweet() {
    const url = window.location.href;
    
    // Must be on tweet detail page
    if (!url.includes('/status/')) {
      return false;
    }

    // Must have Space-related elements
    const spaceElement = this.getElementByXPath(
      XSpaceAutoRefresh.CONSTANTS.XPATHS.spaceParticipationStatus
    );
    return spaceElement !== null;
  }

  /**
   * Check if currently listening to a Space
   * @returns {boolean} True if listening to Space
   */
  isListeningToSpace() {
    const element = this.getElementByXPath(
      XSpaceAutoRefresh.CONSTANTS.XPATHS.spaceParticipationStatus
    );
    
    if (!element) {
      return false;
    }
    
    const text = element.textContent.trim();
    const { PARTICIPATING, PAUSED } = XSpaceAutoRefresh.CONSTANTS.PARTICIPATION_TEXTS;
    
    return text === PARTICIPATING || text === PAUSED;
  }

  /**
   * Get current reply count on the page
   * @returns {number} Number of replies detected
   */
  getReplyCount() {
    const replies = document.querySelectorAll('[data-testid="tweetText"]');
    return replies.length;
  }

  // ================================
  // REFRESH CYCLE MANAGEMENT
  // ================================

  /**
   * Start the refresh cycle
   * Begins automatic scrolling and button clicking at set intervals
   */
  startRefreshCycle() {
    // Prevent duplicate cycles
    if (this.refreshInterval) {
      return;
    }

    // Execute first refresh immediately (with condition check)
    if (this.shouldStartRefreshCycle()) {
      this.performRefreshActions();
    } else {
      this.logWarning('Conditions not met for starting refresh cycle');
      return;
    }

    // Set up recurring refresh cycle
    this.refreshInterval = setInterval(() => {
      // Re-check conditions before each execution
      if (!this.shouldStartRefreshCycle()) {
        this.logInfo('Conditions changed during refresh cycle, stopping');
        this.stopRefreshCycle();
        return;
      }
      this.performRefreshActions();
    }, this.refreshIntervalMs);

    this.logInfo('Refresh cycle started with interval:', this.refreshIntervalMs + 'ms');
  }  /**
   * Perform refresh actions: scroll and sort replies
   * Includes condition checks before and after each action
   */
  async performRefreshActions() {
    try {
      // Pre-action condition check
      if (!this.shouldStartRefreshCycle()) {
        this.logInfo('Conditions no longer met during refresh actions, stopping');
        this.stopRefreshCycle();
        return;
      }

      // Check minimum reply count requirement
      const replyCount = this.getReplyCount();
      if (replyCount < XSpaceAutoRefresh.CONSTANTS.MIN_REPLY_COUNT) {
        this.logInfo(`Reply count (${replyCount}) below minimum (${XSpaceAutoRefresh.CONSTANTS.MIN_REPLY_COUNT}), skipping actions`);
        return;
      }

      this.logInfo(`Performing refresh actions (Reply count: ${replyCount})`);

      // Step 1: Scroll down
      await this.performScrollAction();
      
      // Step 2: Click reply settings button
      await this.performReplySettingsClick();
      
      // Step 3: Click latest sort button
      await this.performLatestSortClick();

    } catch (error) {
      this.logError('Error performing refresh actions:', error);
    }
  }

  /**
   * Perform scroll action with condition checking
   */
  async performScrollAction() {
    // Scroll down by configured amount
    window.scrollBy(0, XSpaceAutoRefresh.CONSTANTS.SCROLL_AMOUNT);
    this.logInfo(`Scrolled ${XSpaceAutoRefresh.CONSTANTS.SCROLL_AMOUNT}px`);

    // Check conditions after scroll
    if (!this.shouldStartRefreshCycle()) {
      this.logInfo('Conditions changed after scroll, stopping');
      this.stopRefreshCycle();
      return false;
    }
    
    return true;
  }

  /**
   * Click reply settings button with condition checking
   */
  async performReplySettingsClick() {
    const replySettingsBtn = this.getElementByXPath(
      XSpaceAutoRefresh.CONSTANTS.XPATHS.replySettingsButton
    );
    
    if (replySettingsBtn) {
      replySettingsBtn.click();
      this.logInfo('Reply settings button clicked');
      
      // Wait for configured delay
      await this.sleep(this.clickDelayMs);
      
      // Check conditions after click
      if (!this.shouldStartRefreshCycle()) {
        this.logInfo('Conditions changed after reply settings click, stopping');
        this.stopRefreshCycle();
        return false;
      }
    } else {
      this.logWarning('Reply settings button not found');
    }
    
    return true;
  }

  /**
   * Click latest sort button
   */
  async performLatestSortClick() {
    const latestSortBtn = this.getElementByXPath(
      XSpaceAutoRefresh.CONSTANTS.XPATHS.latestSortButton
    );
    
    if (latestSortBtn) {
      latestSortBtn.click();
      this.logInfo('Latest sort button clicked');
    } else {
      this.logWarning('Latest sort button not found');
    }
  }

  // ================================
  // UTILITY METHODS
  // ================================

  /**
   * Get DOM element by XPath
   * @param {string} xpath - XPath expression
   * @returns {Element|null} Found element or null
   */
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

  /**
   * Sleep for specified milliseconds
   * @param {number} ms - Milliseconds to sleep
   * @returns {Promise} Promise that resolves after delay
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // ================================
  // LOGGING METHODS
  // ================================

  /**
   * Log info message with tab identifier
   * @param {string} message - Message to log
   * @param {...any} args - Additional arguments
   */
  logInfo(message, ...args) {
    console.log(`[Tab ${this.tabId}] ${message}`, ...args);
  }

  /**
   * Log warning message with tab identifier
   * @param {string} message - Message to log
   * @param {...any} args - Additional arguments
   */
  logWarning(message, ...args) {
    console.warn(`[Tab ${this.tabId}] ${message}`, ...args);
  }

  /**
   * Log error message with tab identifier
   * @param {string} message - Message to log
   * @param {...any} args - Additional arguments
   */
  logError(message, ...args) {
    console.error(`[Tab ${this.tabId}] ${message}`, ...args);
  }
}

// ================================
// EXTENSION INITIALIZATION
// ================================

// Create and initialize the extension instance
const xSpaceAutoRefresh = new XSpaceAutoRefresh();
