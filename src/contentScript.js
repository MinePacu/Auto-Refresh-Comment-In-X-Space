'use strict';

// ================================
// DUPLICATE LOADING PREVENTION
// ================================

// 중복 로딩 방지 및 기존 인스턴스 정리
if (window.xSpaceAutoRefreshLoaded) {
  console.log('X Space Auto Refresh already loaded, cleaning up existing instance...');
  
  // 기존 인스턴스 정리
  if (window.xSpaceAutoRefreshInstance) {
    try {
      window.xSpaceAutoRefreshInstance.cleanup();
    } catch (error) {
      console.warn('Error cleaning up existing instance:', error);
    }
    window.xSpaceAutoRefreshInstance = null;
  }
} else {
  window.xSpaceAutoRefreshLoaded = true;
}

/**
 * X (Twitter) Space Auto Refresh Extension Content Script
 * 
 * This class manages automatic detection and interaction with X Spaces:
 * - Detects when user is on X site, Space tweet, and listening to a Space
 * - Automatically scrolls and sorts replies when conditions are met
 * - Supports per-tab independent operation with robust state management
 * - Handles Chrome extension updates with robust recovery system
 */
class XSpaceAutoRefresh {
  
  // ================================
  // UPDATE RECOVERY SYSTEM
  // ================================
  
  /**
   * Initialize Chrome extension update recovery system
   */
  initializeUpdateRecovery() {
    // Set up context validation check
    this.startContextValidationCheck();
    
    // Check for previous update recovery on load
    this.checkForUpdateRecovery();
    
    // Listen for background script update notifications
    this.setupUpdateNotificationListener();
  }
  
  /**
   * Safe Chrome API wrapper methods to handle context invalidation
   */
  
  /**
   * Safe wrapper for chrome.storage.sync.get
   */
  safeStorageGet(keys, callback) {
    if (this.contextInvalidated) {
      this.debugLog('Context invalidated, falling back to localStorage');
      this.emergencyBackupToLocalStorage();
      return;
    }
    
    try {
      chrome.storage.sync.get(keys, (result) => {
        if (chrome.runtime.lastError) {
          this.debugLog('Chrome storage error:', chrome.runtime.lastError);
          if (chrome.runtime.lastError.message.includes('Extension context invalidated')) {
            this.handleContextInvalidation();
            return;
          }
        }
        callback(result);
      });
    } catch (error) {
      this.debugLog('Chrome storage access failed:', error);
      this.handleContextInvalidation();
    }
  }
  
  /**
   * Safe wrapper for chrome.storage.sync.set
   */
  safeStorageSet(items, callback) {
    if (this.contextInvalidated) {
      this.debugLog('Context invalidated, falling back to localStorage');
      this.emergencyBackupToLocalStorage();
      return;
    }
    
    try {
      chrome.storage.sync.set(items, () => {
        if (chrome.runtime.lastError) {
          this.debugLog('Chrome storage error:', chrome.runtime.lastError);
          if (chrome.runtime.lastError.message.includes('Extension context invalidated')) {
            this.handleContextInvalidation();
            return;
          }
        }
        if (callback) callback();
      });
    } catch (error) {
      this.debugLog('Chrome storage access failed:', error);
      this.handleContextInvalidation();
    }
  }
  
  /**
   * Safe wrapper for chrome.runtime.sendMessage
   */
  safeSendMessage(message, callback) {
    if (this.contextInvalidated) {
      this.debugLog('Context invalidated, cannot send message');
      return;
    }
    
    try {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
          this.debugLog('Chrome runtime error:', chrome.runtime.lastError);
          if (chrome.runtime.lastError.message.includes('Extension context invalidated')) {
            this.handleContextInvalidation();
            return;
          }
        }
        if (callback) callback(response);
      });
    } catch (error) {
      this.debugLog('Chrome runtime access failed:', error);
      this.handleContextInvalidation();
    }
  }
  
  /**
   * Start periodic context validation check
   */
  startContextValidationCheck() {
    setInterval(() => {
      if (!this.contextInvalidated) {
        this.validateContext();
      }
    }, 5000); // Check every 5 seconds
  }
  
  /**
   * Validate Chrome extension context
   */
  validateContext() {
    try {
      // Simple test to check if Chrome APIs are accessible
      chrome.runtime.getManifest();
      return true;
    } catch (error) {
      this.debugLog('Context validation failed:', error);
      this.handleContextInvalidation();
      return false;
    }
  }
  
  /**
   * Handle Chrome extension context invalidation (usually due to update)
   */
  handleContextInvalidation() {
    if (this.contextInvalidated) return; // Already handled
    
    this.contextInvalidated = true;
    this.updateDetected = true;
    
    this.debugLog('Chrome extension context invalidated - likely due to update');
    
    // Emergency backup current state to localStorage
    this.emergencyBackupToLocalStorage();
    
    // Notify user about update
    this.showUpdateNotification('Extension is updating... Your settings will be restored shortly.');
    
    // Stop all timers and activities
    this.stopAllTimers();
    
    // Start recovery check
    this.startRecoveryCheck();
  }
  
  /**
   * Emergency backup current state to localStorage
   */
  emergencyBackupToLocalStorage() {
    try {
      const backupState = {
        isActive: this.isActive,
        refreshInterval: this.refreshIntervalMs,
        clickDelayMs: this.clickDelayMs,
        debugLogEnabled: this.debugLogEnabled,
        lastActiveUrl: window.location.href,
        timestamp: Date.now(),
        wasAutoRefreshing: !!this.refreshTimer,
        tabId: this.tabId
      };
      
      localStorage.setItem('xspace_extension_backup', JSON.stringify(backupState));
      this.debugLog('Emergency backup saved to localStorage');
    } catch (error) {
      console.error('Failed to save emergency backup:', error);
    }
  }
  
  /**
   * Start recovery check after update
   */
  startRecoveryCheck() {
    this.recoveryCheckInterval = setInterval(() => {
      this.attemptRecovery();
    }, 2000); // Check every 2 seconds
  }
  
  /**
   * Attempt to recover from update
   */
  attemptRecovery() {
    this.recoveryAttempts++;
    
    if (this.recoveryAttempts > this.maxRecoveryAttempts) {
      this.debugLog('Max recovery attempts reached, stopping recovery');
      if (this.recoveryCheckInterval) {
        clearInterval(this.recoveryCheckInterval);
        this.recoveryCheckInterval = null;
      }
      this.showUpdateNotification('Extension updated. Please refresh the page if auto-refresh is not working.', 'warning');
      return;
    }
    
    // Test if Chrome APIs are working again
    try {
      chrome.runtime.getManifest();
      this.debugLog('Chrome APIs are working again, attempting recovery');
      this.recoverFromUpdate();
    } catch (error) {
      this.debugLog(`Recovery attempt ${this.recoveryAttempts} failed:`, error);
    }
  }
  
  /**
   * Recover state after Chrome extension update
   */
  recoverFromUpdate() {
    try {
      // Clear recovery interval
      if (this.recoveryCheckInterval) {
        clearInterval(this.recoveryCheckInterval);
        this.recoveryCheckInterval = null;
      }
      
      // Load backup state from localStorage
      const backupData = localStorage.getItem('xspace_extension_backup');
      if (backupData) {
        const backupState = JSON.parse(backupData);
        
        // Restore state
        this.isActive = backupState.isActive || false;
        this.refreshIntervalMs = backupState.refreshInterval || this.constructor.CONSTANTS.DEFAULT_REFRESH_INTERVAL;
        this.clickDelayMs = backupState.clickDelayMs || this.constructor.CONSTANTS.DEFAULT_CLICK_DELAY;
        this.debugLogEnabled = backupState.debugLogEnabled || false;
        
        // Clear backup
        localStorage.removeItem('xspace_extension_backup');
        
        this.debugLog('State recovered from backup:', backupState);
        
        // Reset flags
        this.contextInvalidated = false;
        this.updateDetected = false;
        this.recoveryAttempts = 0;
        
        // Restart auto-refresh if it was running
        if (backupState.wasAutoRefreshing && this.isActive) {
          this.startAutoRefresh();
          this.showUpdateNotification('Extension updated and auto-refresh resumed!', 'success');
        } else {
          this.showUpdateNotification('Extension updated successfully!', 'success');
        }
        
        // Sync restored state back to chrome.storage
        this.syncRestoredState();
        
      } else {
        this.debugLog('No backup state found, starting fresh');
        this.contextInvalidated = false;
        this.updateDetected = false;
        this.showUpdateNotification('Extension updated. Settings may need to be reconfigured.', 'info');
      }
      
    } catch (error) {
      console.error('Failed to recover from update:', error);
      this.showUpdateNotification('Extension updated but recovery failed. Please refresh the page.', 'error');
    }
  }
  
  /**
   * Check for update recovery on page load
   */
  checkForUpdateRecovery() {
    const backupData = localStorage.getItem('xspace_extension_backup');
    if (backupData) {
      try {
        const backupState = JSON.parse(backupData);
        const timeSinceBackup = Date.now() - backupState.timestamp;
        
        // If backup is less than 5 minutes old and from same URL, attempt recovery
        if (timeSinceBackup < 300000 && backupState.lastActiveUrl === window.location.href) {
          this.debugLog('Found recent backup, attempting recovery');
          this.recoverFromUpdate();
        } else {
          // Clean up old backup
          localStorage.removeItem('xspace_extension_backup');
        }
      } catch (error) {
        console.error('Failed to parse backup data:', error);
        localStorage.removeItem('xspace_extension_backup');
      }
    }
  }
  
  /**
   * Sync restored state back to chrome.storage
   */
  syncRestoredState() {
    const tabMasterKey = this.getTabSettingKey('masterOn');
    
    // Use safe storage methods
    this.safeStorageSet({
      [tabMasterKey]: this.isActive,
      refreshInterval: this.refreshIntervalMs / 1000,
      clickDelayMs: this.clickDelayMs,
      debugLogEnabled: this.debugLogEnabled
    });
  }
  
  /**
   * Setup listener for background script update notifications
   */
  setupUpdateNotificationListener() {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request.action === 'extensionUpdated') {
        this.debugLog('Received extension update notification from background');
        this.handleExtensionUpdate();
        sendResponse({ received: true });
      }
    });
  }
  
  /**
   * Handle extension update notification from background script
   */
  handleExtensionUpdate() {
    this.showUpdateNotification('Extension has been updated. Checking for recovery...', 'info');
    
    // Small delay to allow chrome APIs to stabilize
    setTimeout(() => {
      this.checkForUpdateRecovery();
    }, 1000);
  }
  
  /**
   * Stop all timers and intervals
   */
  stopAllTimers() {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
    
    if (this.detectionTimer) {
      clearInterval(this.detectionTimer);
      this.detectionTimer = null;
    }
    
    if (this.detectionInterval) {
      clearInterval(this.detectionInterval);
      this.detectionInterval = null;
    }
    
    if (this.recoveryCheckInterval) {
      clearInterval(this.recoveryCheckInterval);
      this.recoveryCheckInterval = null;
    }
  }
  
  /**
   * Show update notification to user
   */
  showUpdateNotification(message, type = 'info') {
    // Remove existing notification
    const existingNotification = document.getElementById('xspace-update-notification');
    if (existingNotification) {
      existingNotification.remove();
    }
    
    // Create notification element
    const notification = document.createElement('div');
    notification.id = 'xspace-update-notification';
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      z-index: 10000;
      padding: 12px 16px;
      border-radius: 8px;
      font-size: 14px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
      max-width: 300px;
      word-wrap: break-word;
      animation: slideIn 0.3s ease-out;
    `;
    
    // Set colors based on type
    const colors = {
      success: { bg: '#d4edda', border: '#c3e6cb', text: '#155724' },
      error: { bg: '#f8d7da', border: '#f5c6cb', text: '#721c24' },
      warning: { bg: '#fff3cd', border: '#ffeaa7', text: '#856404' },
      info: { bg: '#d1ecf1', border: '#bee5eb', text: '#0c5460' }
    };
    
    const color = colors[type] || colors.info;
    notification.style.backgroundColor = color.bg;
    notification.style.border = `1px solid ${color.border}`;
    notification.style.color = color.text;
    
    notification.textContent = message;
    
    // Add CSS animation
    const style = document.createElement('style');
    style.textContent = `
      @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
      }
    `;
    document.head.appendChild(style);
    
    document.body.appendChild(notification);
    
    // Auto remove after 5 seconds
    setTimeout(() => {
      if (notification.parentNode) {
        notification.remove();
      }
      if (style.parentNode) {
        style.remove();
      }
    }, 5000);
  }
  
  // ================================
  // CONSTANTS AND CONFIGURATION
  // ================================
    static CONSTANTS = {
    DETECTION_INTERVAL: 1000,           // 1초마다 상태 감지
    DEFAULT_REFRESH_INTERVAL: 10000,    // 기본 10초 새로고침 주기
    DEFAULT_CLICK_DELAY: 700,           // 기본 700ms 클릭 간 대기
    MIN_REPLY_COUNT: 10,               // 최소 답글 수
    SCROLL_AMOUNT: 500,                // 스크롤 픽셀
    
    // X (Twitter) Rate Limit 관련 설정
    // X-Rate-Limit-Limit: 150 requests per 15-minute window
    X_RATE_LIMIT: 150,                 // X API Rate Limit (15분당 150 요청)
    X_RATE_WINDOW_MINUTES: 15,         // Rate Limit 시간 윈도우 (분)
    SAFETY_MARGIN: 0.8,                // 안전 마진 (80% 사용)
    MIN_REFRESH_INTERVAL: 7200,        // 최소 새로고침 간격 (밀리초) = 7.2초
    // 계산: (15분 * 60초 * 1000ms) / (150 * 0.8) = 900000 / 120 = 7500ms
    // 실제로는 7.2초로 더 안전하게 설정
    
    // XPath selectors for X (Twitter) elements
    XPATHS: {
      spaceRecordingParticipationStatus: '/html/body/div[1]/div/div/div[2]/main/div/div/div/div[1]/div/section/div/div/div[1]/div/div/article/div/div/div[3]/div[2]/div/div/div/div/button/div/div[4]/button/div/span/span',
      spaceParticipationStatus: '/html/body/div[1]/div/div/div[2]/main/div/div/div/div[1]/div/section/div/div/div[1]/div/div/article/div/div/div[3]/div[2]/div/div/div/div/div/div/div[4]/a/div/span/span',
      spaceParticipationStatus2 : '/html/body/div[1]/div/div/div[2]/main/div/div/div/div[1]/div/section/div/div/div[1]/div/div/article/div/div/div[3]/div[2]/div/div/div/div/div/div/div[3]/a/div/span/span',
      replySettingsButton: '//*[@id="react-root"]/div/div/div[2]/main/div/div/div/div[1]/div/div[1]/div[1]/div/div/div/div/div/div[3]/div/button[2]',
      latestSortButton: '//*[@id="layers"]/div[2]/div/div/div/div[2]/div/div[3]/div/div/div/div[3]'
    },
    
    // Expected text content for space participation status
    PARTICIPATION_TEXTS: {
      PARTICIPATING: '참여했습니다',
      PAUSED: '일시 정지'
    }  };
  // ================================
  // CONSTRUCTOR AND INITIALIZATION
  // ================================
  constructor() {
    // Initialize update recovery system properties
    this.contextInvalidated = false;
    this.updateDetected = false;
    this.recoveryAttempts = 0;
    this.maxRecoveryAttempts = 5;
    this.recoveryCheckInterval = null;
    
    this.isActive = false;
    this.detectionInterval = null;
    this.detectionTimer = null;
    this.refreshInterval = null;
    this.refreshTimer = null;
    this.refreshIntervalMs = XSpaceAutoRefresh.CONSTANTS.DEFAULT_REFRESH_INTERVAL;
    this.clickDelayMs = XSpaceAutoRefresh.CONSTANTS.DEFAULT_CLICK_DELAY;
    this.tabId = null;
    
    // 첫 번째 새로고침 추적용 플래그
    this.isFirstRefresh = true;
    
    // 디버그 로그 설정
    this.debugLogEnabled = false;
    
    // 액션 실행 중 플래그 (race condition 방지)
    this.isPerformingActions = false;
    
    // 페이지 언로드 시 정리를 위한 바인딩
    this.boundCleanup = this.cleanup.bind(this);
    
    // 페이지 언로드 시 정리 이벤트 등록
    window.addEventListener('beforeunload', this.boundCleanup);

    // Initialize update recovery system
    this.initializeUpdateRecovery();
    
    this.initialize();
  }

  /**
   * Initialize the extension
   * Sets up tab ID, loads settings, and registers message listeners
   */  
  initialize() {
    this.setupMessageListeners();
    this.requestTabIdFromBackground();
    this.loadDebugLogSetting();
    
    this.logInfo('X Space Auto Refresh initializing...');
  }

  /**
   * Request actual tab ID from background script
   */
  requestTabIdFromBackground() {
    this.safeSendMessage(
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
    
    this.safeStorageGet(settingsToLoad, (result) => {
      this.isActive = result[tabMasterKey] || false;
      
      // 새로고침 간격 유효성 검사 적용
      const rawRefreshInterval = (result.refreshInterval || 10) * 1000;
      this.refreshIntervalMs = this.validateRefreshInterval(rawRefreshInterval);
      
      // 로드된 값이 조정되었다면 저장소에 다시 저장
      if (this.refreshIntervalMs !== rawRefreshInterval) {
        const adjustedSeconds = this.refreshIntervalMs / 1000;
        this.safeStorageSet({ refreshInterval: adjustedSeconds });
        this.logWarning(`Loaded refresh interval adjusted from ${rawRefreshInterval/1000}s to ${adjustedSeconds}s due to Rate Limit constraints`);
      }
      
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

  /**
   * Load debug log setting from Chrome storage
   */
  loadDebugLogSetting() {
    this.safeStorageGet(['debugLogEnabled'], (result) => {
      this.debugLogEnabled = result.debugLogEnabled || false;
      this.logInfo('Debug log setting loaded:', this.debugLogEnabled);
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
        case 'PING':
          // Content Script 준비 상태 확인용
          sendResponse({ status: 'ready', tabId: this.tabId });
          break;

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
          break;        case 'GET_STATUS':
          try {
            this.handleGetStatus(sendResponse);
          } catch (statusError) {
            this.logError('Error getting status:', statusError);
            sendResponse({ 
              status: 'error', 
              error: 'Failed to get status',
              data: {
                isActive: this.isActive,
                isOnXSite: false,
                isOnSpaceTweet: false,
                isListeningToSpace: false,
                replyCount: 0,
                url: window.location.href,
                tabId: this.tabId
              }
            });
          }
          break;        case 'SET_DEBUG_LOG':
          this.handleSetDebugLog(payload, sendResponse);
          break;

        case 'SETTINGS_UPDATED':
          this.handleSettingsUpdated(payload, sendResponse);
          break;

        default:
          this.logWarning('Unknown message type:', type);
          sendResponse({ status: 'unknown_message_type' });
      }
    } catch (error) {
      this.logError('Error handling message:', error);
      sendResponse({ 
        status: 'error', 
        error: error.message,
        messageType: type 
      });
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
    
    this.safeStorageGet([oldTabKey], (result) => {
      if (result[oldTabKey] !== undefined) {
        // 새 키로 설정 저장
        this.safeStorageSet({ [newTabKey]: result[oldTabKey] });
        // 이전 키 삭제 (안전한 방법으로 처리)
        try {
          chrome.storage.sync.remove([oldTabKey]);
        } catch (error) {
          this.debugLog('Failed to remove old tab key:', error);
        }
        
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
    this.safeStorageSet({ [tabMasterKey]: this.isActive });
    
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
    const requestedInterval = payload.interval * 1000; // Convert to milliseconds
    const validatedInterval = this.validateRefreshInterval(requestedInterval);
    
    this.refreshIntervalMs = validatedInterval;
    
    // Save as global setting (shared across all tabs)
    // Store in seconds for compatibility with popup
    this.safeStorageSet({ refreshInterval: validatedInterval / 1000 });
    
    if (validatedInterval !== requestedInterval) {
      const minSeconds = XSpaceAutoRefresh.CONSTANTS.MIN_REFRESH_INTERVAL / 1000;
      this.logWarning(`Refresh interval adjusted from ${payload.interval}s to ${validatedInterval/1000}s (minimum: ${minSeconds}s due to X Rate Limit)`);
      sendResponse({ 
        status: 'adjusted', 
        adjustedInterval: validatedInterval / 1000,
        message: `간격이 X Rate Limit 정책에 따라 최소 ${minSeconds}초로 조정되었습니다.`
      });
    } else {
      this.logInfo('Refresh interval set to:', this.refreshIntervalMs);
      sendResponse({ status: 'success' });
    }
    
    // Restart refresh cycle if needed with new interval
    this.restartRefreshCycleIfNeeded();
  }

  /**
   * Validate refresh interval against X Rate Limit constraints
   * @param {number} intervalMs - Requested interval in milliseconds
   * @returns {number} Validated interval in milliseconds
   */
  validateRefreshInterval(intervalMs) {
    const minInterval = XSpaceAutoRefresh.CONSTANTS.MIN_REFRESH_INTERVAL;
    
    if (intervalMs < minInterval) {
      this.logWarning(`Refresh interval ${intervalMs}ms is below minimum ${minInterval}ms (X Rate Limit: ${XSpaceAutoRefresh.CONSTANTS.X_RATE_LIMIT} requests per ${XSpaceAutoRefresh.CONSTANTS.X_RATE_WINDOW_MINUTES} minutes)`);
      return minInterval;
    }
    
    return intervalMs;
  }

  /**
   * Calculate safe refresh interval based on X Rate Limit
   * @returns {Object} Rate limit information and recommended intervals
   */
  static calculateRateLimitInfo() {
    const rateLimitPerWindow = XSpaceAutoRefresh.CONSTANTS.X_RATE_LIMIT;
    const windowMinutes = XSpaceAutoRefresh.CONSTANTS.X_RATE_WINDOW_MINUTES;
    const safetyMargin = XSpaceAutoRefresh.CONSTANTS.SAFETY_MARGIN;
    
    // Calculate safe request rate
    const safeRequestsPerWindow = Math.floor(rateLimitPerWindow * safetyMargin);
    const windowMs = windowMinutes * 60 * 1000;
    const minIntervalMs = Math.ceil(windowMs / safeRequestsPerWindow);
    
    return {
      rateLimitPerWindow,
      windowMinutes,
      safeRequestsPerWindow,
      minIntervalMs,
      minIntervalSeconds: minIntervalMs / 1000,
      recommendedIntervalSeconds: Math.ceil(minIntervalMs / 1000)
    };
  }

  /**
   * Handle click delay setting message
   * @param {Object} payload - Message payload
   * @param {Function} sendResponse - Response callback
   */
  handleSetClickDelay(payload, sendResponse) {
    let delay = payload.delay;
      // 최솟값 검증
    if (delay < 1) {
      delay = 1;
      this.logWarning(`Click delay adjusted from ${payload.delay}ms to ${delay}ms (minimum: 1ms)`);
    }
    
    this.clickDelayMs = delay;
    
    // Save as global setting (shared across all tabs)
    this.safeStorageSet({ clickDelayMs: this.clickDelayMs });
    this.logInfo('Click delay set to:', this.clickDelayMs);
    
    sendResponse({ status: 'success' });
  }

  /**
   * Handle status request message
   * @param {Function} sendResponse - Response callback
   */  
  /**
   * Handle status request message with enhanced error handling
   * @param {Function} sendResponse - Response callback
   */  
  handleGetStatus(sendResponse) {
    try {
      const status = this.getCurrentStatus();
      this.logInfo('Sending status:', status);
      sendResponse({ status: 'success', data: status });
    } catch (error) {
      this.logError('Error getting current status:', error);
      
      // 안전한 기본 상태 반환
      const safeStatus = {
        isActive: this.isActive || false,
        isOnXSite: this.isOnXSite() || false,
        isOnSpaceTweet: false, // 오류 발생 시 안전하게 false
        isListeningToSpace: false, // 오류 발생 시 안전하게 false
        replyCount: 0,
        url: window.location.href || '',
        tabId: this.tabId || 'unknown',
        error: error.message
      };
      
      sendResponse({ status: 'partial_success', data: safeStatus });
    }
  }

  /**
   * Handle debug log setting message
   * @param {Object} payload - Message payload
   * @param {Function} sendResponse - Response callback
   */
  handleSetDebugLog(payload, sendResponse) {
    this.debugLogEnabled = payload.enabled;
    this.logInfo('Debug log setting updated:', this.debugLogEnabled);
    sendResponse({ status: 'success' });
  }
  /**
   * Handle settings update broadcast from background script
   * @param {Object} payload - Message payload containing updated settings
   * @param {Function} sendResponse - Response callback
   */
  handleSettingsUpdated(payload, sendResponse) {
    const { settings } = payload;
    
    this.logInfo('Received settings update from background script:', settings);
    
    let hasChanges = false;
    
    // 새로고침 주기 업데이트
    if (settings.refreshInterval !== undefined) {
      const newIntervalMs = settings.refreshInterval * 1000;
      const validatedInterval = this.validateRefreshInterval(newIntervalMs);
      
      if (this.refreshIntervalMs !== validatedInterval) {
        this.refreshIntervalMs = validatedInterval;
        this.logInfo('Updated refresh interval to:', this.refreshIntervalMs);
        hasChanges = true;
        
        // 활성 상태라면 새로고침 주기 재시작
        this.restartRefreshCycleIfNeeded();
      }
    }
    
    // 클릭 간 대기시간 업데이트
    if (settings.clickDelayMs !== undefined) {
      let delay = settings.clickDelayMs;
      // 최솟값 검증
      if (delay < 5) {
        delay = 5;
      }
      
      if (this.clickDelayMs !== delay) {
        this.clickDelayMs = delay;
        this.logInfo('Updated click delay to:', this.clickDelayMs);
        hasChanges = true;
      }
    }
    
    // 디버그 로그 설정 업데이트
    if (settings.debugLogEnabled !== undefined) {
      if (this.debugLogEnabled !== settings.debugLogEnabled) {
        this.debugLogEnabled = settings.debugLogEnabled;
        this.logInfo('Updated debug log setting to:', this.debugLogEnabled);
        hasChanges = true;
      }
    }
    
    // 테마 설정은 contentScript에서 직접 처리하지 않으므로 로그만 출력
    if (settings.theme !== undefined) {
      this.logInfo('Theme setting updated to:', settings.theme);
    }
    
    // 변경사항이 있을 때만 응답
    if (hasChanges) {
      this.logInfo('Settings updated successfully');
    }
    
    sendResponse({ status: 'success' });
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
    
    this.logInfo('DEBUG: Starting detection cycle');
    
    // Execute detection immediately on start
    this.performDetection();
    
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
  }  
  
  /**
   * Perform detection cycle
   * Checks all conditions and manages refresh cycle accordingly
   */
  performDetection() {
    this.logInfo('DEBUG: Performing detection cycle');
    
    // Stop refresh cycle if not on X site
    if (!this.isOnXSite()) {
      this.logInfo('DEBUG: Not on X site, stopping refresh cycle');
      this.stopRefreshCycle();
      return;
    }

    // Stop refresh cycle if not on Space tweet
    if (!this.isOnSpaceTweet()) {
      this.logInfo('DEBUG: Not on Space tweet, stopping refresh cycle');
      this.stopRefreshCycle();
      return;
    }

    // Stop refresh cycle if not listening to Space
    if (!this.isListeningToSpace()) {
      this.logInfo('DEBUG: Not listening to Space, stopping refresh cycle');
      this.stopRefreshCycle();
      return;
    }

    // All conditions met - start refresh cycle
    this.logInfo('DEBUG: All conditions met, starting refresh cycle');
    this.startRefreshCycle();
  }

  /**
   * Get current extension status
   * @returns {Object} Current status information
   */
  /**
   * Get current extension status with error handling
   * @returns {Object} Current status information
   */
  getCurrentStatus() {
    const status = {
      isActive: this.isActive,
      url: window.location.href,
      tabId: this.tabId
    };

    try {
      status.isOnXSite = this.isOnXSite();
    } catch (error) {
      this.logError('Error checking X site status:', error);
      status.isOnXSite = false;
    }

    try {
      status.isOnSpaceTweet = this.isOnSpaceTweet();
    } catch (error) {
      this.logError('Error checking Space tweet status:', error);
      status.isOnSpaceTweet = false;
    }

    try {
      status.isListeningToSpace = this.isListeningToSpace();
    } catch (error) {
      this.logError('Error checking Space listening status:', error);
      status.isListeningToSpace = false;
    }

    try {
      status.replyCount = this.getReplyCount();
    } catch (error) {
      this.logError('Error getting reply count:', error);
      status.replyCount = 0;
    }

    return status;
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
    
    // 사이클이 중단되면 다음에 다시 시작할 때 첫 번째 새로고침부터 시작
    this.isFirstRefresh = true;
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
    const liveSpaceElement = this.getElementByXPath(
      XSpaceAutoRefresh.CONSTANTS.XPATHS.spaceParticipationStatus
    );

    if (!liveSpaceElement) {
      this.logInfo('DEBUG: Live Space participation element not found, checking for participation2 element');
      const liveSpaceElement2 = this.getElementByXPath(
        XSpaceAutoRefresh.CONSTANTS.XPATHS.spaceParticipationStatus2
      );

      // liveSpaceElement2 null 체크 추가
      if (!liveSpaceElement2) {
        // 디버그 로그가 활성화된 경우에만 녹화된 스페이스 엘리먼트 확인
        if (this.debugLogEnabled) {
          const recordSpaceElement = this.getElementByXPath(
            XSpaceAutoRefresh.CONSTANTS.XPATHS.spaceRecordingParticipationStatus
          );
          this.logInfo('DEBUG: Record Space element found:', recordSpaceElement !== null);
          return recordSpaceElement !== null;
        }
        
        return false;
      }

      return true; // liveSpaceElement2가 존재하면 true 반환
    }

    return true; // liveSpaceElement가 존재하면 true 반환
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
      this.logInfo('DEBUG: Live Space participation element not found, checking for participation2 element');
      const element2 = this.getElementByXPath(
        XSpaceAutoRefresh.CONSTANTS.XPATHS.spaceParticipationStatus2
      );

      // element2 null 체크 추가
      if (!element2) {
        // 디버그 로그가 활성화된 경우에만 녹화된 스페이스 엘리먼트 확인
        if (this.debugLogEnabled) {
          const recordElement = this.getElementByXPath(
            XSpaceAutoRefresh.CONSTANTS.XPATHS.spaceRecordingParticipationStatus
          );
          this.logInfo('DEBUG: Record Space participation element found:', recordElement !== null);
          
          if (recordElement) {
            const recordText = recordElement.textContent.trim();
            const { PARTICIPATING, PAUSED } = XSpaceAutoRefresh.CONSTANTS.PARTICIPATION_TEXTS;
            return recordText === PARTICIPATING || recordText === PAUSED;
          }
        }
        
        this.logInfo('DEBUG: No participation elements found');
        return false;
      }

      const text = element2.textContent.trim();
      const { PARTICIPATING, PAUSED } = XSpaceAutoRefresh.CONSTANTS.PARTICIPATION_TEXTS;
      
      return text === PARTICIPATING || text === PAUSED;
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
      this.logInfo('DEBUG: Refresh cycle already running, skipping start');
      return;
    }

    // 새 사이클 시작 시 첫 번째 새로고침 플래그 리셋
    this.isFirstRefresh = true;
    this.logInfo('DEBUG: Starting new refresh cycle, isFirstRefresh set to true');

    // Execute first refresh immediately (with condition check)
    if (this.shouldStartRefreshCycle()) {
      this.logInfo('DEBUG: Conditions met, executing first refresh immediately');
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
      this.logInfo('DEBUG: Executing scheduled refresh action');
      this.performRefreshActions();
    }, this.refreshIntervalMs);

    this.logInfo('Refresh cycle started with interval:', this.refreshIntervalMs + 'ms');
  }
    /**
   * Perform refresh actions: scroll and sort replies
   * Includes condition checks before and after each action
   * First refresh cycle: scroll + go to top + buttons
   * Subsequent cycles: buttons only
   */
  async performRefreshActions() {
    // Race condition 방지: 이미 액션이 실행 중이면 건너뛰기
    if (this.isPerformingActions) {
      this.logInfo('Actions already in progress, skipping this cycle');
      return;
    }
    
    try {
      this.isPerformingActions = true;
      
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

      // Debug log for first refresh flag
      this.logInfo(`DEBUG: isFirstRefresh = ${this.isFirstRefresh}`);

      if (this.isFirstRefresh) {
        this.logInfo(`Performing FIRST refresh actions (Reply count: ${replyCount}) - including scroll and go to top`);
        
        // Step 1: Scroll down
        this.logInfo('DEBUG: Starting scroll down action');
        const scrollSuccess = await this.performScrollAction();
        if (!scrollSuccess) return;
        
        // Step 2: Go to top of page
        this.logInfo('DEBUG: Starting go to top action');
        const topSuccess = await this.performGoToTopAction();
        if (!topSuccess) return;
        
        // Step 3: Click reply settings button
        this.logInfo('DEBUG: Starting reply settings click');
        const replySuccess = await this.performReplySettingsClick();
        if (!replySuccess) return;
        
        // Step 4: Click latest sort button
        this.logInfo('DEBUG: Starting latest sort click');
        await this.performLatestSortClick();
        
        // Mark first refresh as completed
        this.isFirstRefresh = false;
        this.logInfo('DEBUG: First refresh completed, isFirstRefresh set to false');
      } else {
        this.logInfo(`Performing SUBSEQUENT refresh actions (Reply count: ${replyCount}) - buttons only`);
        
        // Subsequent cycles: buttons only
        // Step 1: Click reply settings button
        const replySuccess = await this.performReplySettingsClick();
        if (!replySuccess) return;
        
        // Step 2: Click latest sort button
        await this.performLatestSortClick();
      }

    } catch (error) {
      this.logError('Error performing refresh actions:', error);
    } finally {
      // 액션 완료 후 플래그 해제
      this.isPerformingActions = false;
    }
  }/**
   * Perform scroll action with condition checking
   */
  async performScrollAction() {
    // Scroll down by configured amount
    const scrollAmount = XSpaceAutoRefresh.CONSTANTS.SCROLL_AMOUNT;
    const beforeScroll = window.pageYOffset;
    
    window.scrollBy(0, scrollAmount);
    this.logInfo(`Scrolled ${scrollAmount}px (before: ${beforeScroll}px)`);

    // Wait for scroll to complete
    await this.sleep(300);
    
    const afterScroll = window.pageYOffset;
    this.logInfo(`Scroll completed (after: ${afterScroll}px, difference: ${afterScroll - beforeScroll}px)`);

    // Check conditions after scroll
    if (!this.shouldStartRefreshCycle()) {
      this.logInfo('Conditions changed after scroll, stopping');
      this.stopRefreshCycle();
      return false;
    }
    
    return true;
  }
  
  /**
   * Perform go to top action with condition checking
   * Scrolls to the top of the page to ensure proper view for subsequent actions
   */
  async performGoToTopAction() {
    // Get current scroll position
    const beforeScroll = window.pageYOffset;
    
    // Scroll to top of page
    window.scrollTo(0, 0);
    this.logInfo(`Scrolled to top of page (before: ${beforeScroll}px)`);

    // Wait a moment for scroll to complete
    await this.sleep(500);
    
    const afterScroll = window.pageYOffset;
    this.logInfo(`Go to top completed (after: ${afterScroll}px)`);

    // Check conditions after scroll to top
    if (!this.shouldStartRefreshCycle()) {
      this.logInfo('Conditions changed after scroll to top, stopping');
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
    
    // 클릭 이벤트가 처리될 시간 확보
    await this.sleep(this.clickDelayMs);
    
    // 추가: DOM 변화 감지를 통한 메뉴 로딩 대기
    let attempts = 0;
    const maxAttempts = 5;
    let menuLoaded = false;
    
    while (!menuLoaded && attempts < maxAttempts) {
      // 메뉴가 로드되었는지 확인
      const menu = document.querySelector('[role="menu"]');
      if (menu) {
        menuLoaded = true;
        this.logInfo('Sort menu loaded successfully');
        // 메뉴가 완전히 렌더링될 시간 추가
        await this.sleep(100);
      } else {
        attempts++;
        this.logInfo(`Waiting for sort menu to load (attempt ${attempts}/${maxAttempts})...`);
        await this.sleep(200); // 짧은 간격으로 재시도
      }
    }
    
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
   * Get DOM element by XPath with error handling
   * @param {string} xpath - XPath expression
   * @returns {Element|null} Found element or null
   */
  /**
   * Get DOM element by XPath with enhanced error handling
   * @param {string} xpath - XPath expression
   * @returns {Element|null} Found element or null
   */
  getElementByXPath(xpath) {
    try {
      if (!xpath || typeof xpath !== 'string') {
        this.logWarning('Invalid XPath provided:', xpath);
        return null;
      }

      const result = document.evaluate(
        xpath,
        document,
        null,
        XPathResult.FIRST_ORDERED_NODE_TYPE,
        null
      );
      
      const element = result.singleNodeValue;
      
      // 추가 유효성 검사
      if (element && element.nodeType === Node.ELEMENT_NODE) {
        return element;
      }
      
      return null;
    } catch (error) {
      this.logError('Error evaluating XPath:', xpath, error);
      return null;
    }
  }

  /**
   * Sleep for specified milliseconds with error handling
   * @param {number} ms - Milliseconds to sleep
   * @returns {Promise} Promise that resolves after delay
   */
  sleep(ms) {
    if (ms < 0 || !Number.isFinite(ms)) {
      this.logWarning('Invalid sleep duration:', ms, 'using 0ms');
      ms = 0;
    }
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
    if (this.debugLogEnabled) {
      console.log(`[Tab ${this.tabId}] ${message}`, ...args);
    }
  }

  /**
   * Log warning message with tab identifier
   * @param {string} message - Message to log
   * @param {...any} args - Additional arguments
   */
  logWarning(message, ...args) {
    if (this.debugLogEnabled) {
      console.warn(`[Tab ${this.tabId}] ${message}`, ...args);
    }
  }

  /**
   * Log error message with tab identifier
   * @param {string} message - Message to log
   * @param {...any} args - Additional arguments
   */
  logError(message, ...args) {
    // 에러는 디버그 로그 설정과 관계없이 항상 출력
    console.error(`[Tab ${this.tabId}] ${message}`, ...args);
  }

  /**
   * Log debug message with tab identifier (only when debug is enabled)
   * @param {string} message - Message to log
   * @param {...any} args - Additional arguments
   */
  debugLog(message, ...args) {
    if (this.debugLogEnabled) {
      console.debug(`[Tab ${this.tabId}] DEBUG: ${message}`, ...args);
    }
  }

  /**
   * Cleanup method to prevent memory leaks
   * Called when page is about to be unloaded
   */
  cleanup() {
    this.logInfo('Cleaning up X Space Auto Refresh...');
    
    // 모든 interval 정리
    this.stopDetection();
    this.stopRefreshCycle();
    
    // 이벤트 리스너 제거
    if (this.boundCleanup) {
      window.removeEventListener('beforeunload', this.boundCleanup);
    }
    
    // 플래그 리셋
    this.isPerformingActions = false;
    this.isFirstRefresh = true;
  }
  
  /**
   * Start auto-refresh functionality (alias for startDetection for better clarity)
   */
  startAutoRefresh() {
    this.startDetection();
  }
  
  /**
   * Stop auto-refresh functionality (alias for stopDetection for better clarity)
   */
  stopAutoRefresh() {
    this.stopDetection();
  }
  
  /**
   * Enhanced cleanup method to handle all timers and resources
   */
  cleanup() {
    this.stopAllTimers();
    
    // Remove event listeners
    if (this.boundCleanup) {
      window.removeEventListener('beforeunload', this.boundCleanup);
    }
    
    // Clear any remaining notification
    const notification = document.getElementById('xspace-update-notification');
    if (notification) {
      notification.remove();
    }
    
    this.logInfo('Extension cleanup completed');
  }
}

// ================================
// EXTENSION INITIALIZATION
// ================================

// 중복 로딩 방지 체크 후 인스턴스 생성
if (!window.xSpaceAutoRefreshInstance) {
  // Create and initialize the extension instance
  window.xSpaceAutoRefreshInstance = new XSpaceAutoRefresh();
  console.log('X Space Auto Refresh instance created and initialized');
} else {
  console.log('X Space Auto Refresh instance already exists, skipping creation');
}
