# <img src="public/icons/icon_48.png" width="45" align="left"> Auto Refresh Comment In X Space

X (구 트위터) 스페이스에서 댓글을 자동으로 최신순으로 정렬해주는 Chrome 확장 프로그램입니다.

## ✨ 주요 기능

### 🎯 스마트 자동화
- **자동 감지**: X 스페이스 페이지와 청취 상태를 실시간으로 감지
- **조건부 실행**: 스페이스 청취 중이고 댓글이 10개 이상일 때만 자동 실행
- **탭별 독립**: 여러 스페이스 탭을 각각 독립적으로 관리

### ⚙️ 유연한 설정
- **새로고침 주기**: 1초~1시간 범위에서 세밀한 조정 (기본값: 10초)
- **클릭 지연시간**: 0ms~10초 범위에서 네트워크 환경에 맞게 조정 (기본값: 700ms)
- **마스터 스위치**: 각 탭별로 ON/OFF 제어 가능

### 🎨 사용자 경험
- **실시간 상태**: 현재 동작 상태를 명확하게 표시
- **다크 모드**: 라이트/다크/시스템 설정 지원
- **직관적 UI**: 간단하고 명확한 인터페이스

## 🔧 동작 원리

### 자동 감지 시스템
1. **사이트 감지**: X(x.com) 또는 Twitter(twitter.com) 접속 확인
2. **페이지 감지**: 스페이스가 포함된 트윗 상세 페이지(`/status/` URL) 확인
3. **청취 상태 감지**: "참여했습니다" 텍스트로 스페이스 청취 여부 판단
4. **댓글 수 확인**: 답글이 10개 이상일 때만 정렬 작업 실행

### 자동 정렬 과정
1. **스크롤**: 500px 아래로 스크롤하여 더 많은 댓글 로드
2. **설정 버튼 클릭**: 답글 설정 버튼 클릭
3. **지연 대기**: 설정된 클릭 지연시간만큼 대기
4. **정렬 버튼 클릭**: 최신순 정렬 버튼 클릭

## 🚀 설치 방법

### 개발자 모드 설치
1. 저장소를 클론하거나 다운로드합니다
```bash
git clone <repository-url>
cd "Auto Refresh in X Space"
```

2. 의존성을 설치합니다
```bash
npm install
```

3. 확장 프로그램을 빌드합니다
```bash
npm run build
```

4. Chrome에서 확장 프로그램을 설치합니다
   - Chrome에서 `chrome://extensions/` 페이지를 엽니다
   - 우상단의 "개발자 모드"를 활성화합니다
   - "압축해제된 확장 프로그램을 로드합니다" 클릭
   - 프로젝트의 `build` 폴더를 선택합니다

## 📖 사용법

### 기본 사용법
1. **X 스페이스 접속**: X에서 원하는 스페이스의 트윗 상세 페이지로 이동
2. **스페이스 청취**: "참여하기" 버튼을 클릭하여 스페이스 청취 시작
3. **확장 프로그램 실행**: 브라우저 상단의 확장 프로그램 아이콘 클릭
4. **마스터 ON**: 팝업에서 마스터 버튼을 `ON`으로 설정
5. **자동 정렬 시작**: 모든 조건이 충족되면 댓글이 자동으로 최신순 정렬됩니다

### 상태 메시지 이해
- **🟢 활성 중 (답글: X개)**: 정상 작동 중, 댓글 자동 정렬 실행
- **🔴 비활성**: 마스터 버튼이 OFF 상태
- **⚪ X 사이트가 아님**: X/Twitter 사이트가 아닌 다른 페이지에 있음
- **⚪ 스페이스 트윗이 아님**: X에는 있지만 스페이스 트윗 페이지가 아님
- **⚪ 스페이스 청취 중이 아님**: 스페이스 페이지에는 있지만 청취하지 않는 상태
- **⚪ 알 수 없음**: 확장 프로그램과 페이지 간 통신 오류

### 설정 조정
#### 새로고침 주기 설정
- 값을 입력하고 "적용" 버튼 클릭
- **권장값**: 10-30초 (네트워크 상황에 따라 조정)
- **주의**: 너무 짧은 주기는 성능에 영향을 줄 수 있음

#### 클릭 간 대기시간 설정
- 값을 입력하고 "적용" 버튼 클릭
- **권장값**: 500-1000ms
- **용도**: 답글 설정 버튼 클릭 후 최신순 정렬 버튼 클릭 전 대기시간

#### 테마 선택
- **라이트**: 밝은 테마
- **다크**: 어두운 테마  
- **시스템 설정**: OS 설정에 따라 자동 전환

## 🛠️ 개발

### 프로젝트 구조
```
├── src/
│   ├── contentScript.js  # 메인 로직 (스페이스 감지 및 자동 정렬)
│   ├── popup.js         # 팝업 UI 로직
│   ├── popup.css        # 팝업 스타일 (테마 포함)
│   └── background.js    # 백그라운드 스크립트 (탭 관리)
├── public/
│   ├── manifest.json    # 확장 프로그램 설정
│   ├── popup.html       # 팝업 HTML
│   └── icons/          # 아이콘 파일들
├── config/             # Webpack 설정
├── build/              # 빌드된 파일들
└── package.json        # 프로젝트 설정
```

### 개발 명령어
```bash
# 개발 모드 (파일 변경 감지)
npm run watch

# 프로덕션 빌드
npm run build
```

### 기술 스택
- **JavaScript ES6+**: 메인 로직
- **Chrome Extension Manifest V3**: 확장 프로그램 API
- **Webpack 5**: 모듈 번들링
- **CSS Variables**: 동적 테마
- **Chrome Storage API**: 설정 저장 및 동기화
- **XPath**: 정확한 DOM 요소 선택

### 핵심 컴포넌트

#### ContentScript (contentScript.js)
```javascript
class XSpaceAutoRefresh {
  // 스페이스 감지 및 자동 정렬 메인 로직
  // - 1초마다 조건 감지
  // - 조건 충족 시 설정된 주기로 정렬 실행
  // - 탭별 독립적인 상태 관리
}
```

#### Popup (popup.js)
```javascript
// UI 제어 및 설정 관리
// - 탭별 마스터 스위치
// - 실시간 상태 표시
// - 설정값 저장/복원
// - 테마 관리
```

#### Background (background.js)
```javascript
// 탭 관리 및 설정 정리
// - 탭 닫힘 감지
// - 탭별 설정 자동 정리
// - 초기 설정값 지정
```

## ⚙️ 설정 옵션

| 설정 | 범위 | 기본값 | 설명 |
|------|------|--------|------|
| 마스터 스위치 | ON/OFF | OFF | 전체 기능 활성화/비활성화 (탭별) |
| 새로고침 주기 | 1-3600초 | 10초 | 댓글 정렬 반복 주기 |
| 클릭 간 대기시간 | 0-10000ms | 700ms | UI 클릭 사이 지연시간 |
| 테마 | 라이트/다크/시스템 | 시스템 | 팝업 UI 테마 |

## 🎯 사용 조건

### 필수 조건
- ✅ X (x.com) 또는 Twitter (twitter.com) 사이트
- ✅ 스페이스가 포함된 트윗 상세 페이지 (`/status/` URL)
- ✅ 스페이스 청취 상태 ("참여했습니다" 또는 "일시 정지" 표시)
- ✅ 답글 10개 이상

### 감지되는 XPath
```javascript
// 스페이스 청취 상태 감지
spaceParticipationStatus: '/html/body/div[1]/div/div/div[2]/main/div/div/div/div[1]/div/section/div/div/div[1]/div/div/article/div/div/div[3]/div[2]/div/div/div/div/button/div/div[4]/button/div/span/span'

// 답글 설정 버튼
replySettingsButton: '//*[@id="react-root"]/div/div/div[2]/main/div/div/div/div[1]/div/div[1]/div[1]/div/div/div/div/div/div[3]/div/button[2]'

// 최신순 정렬 버튼
latestSortButton: '//*[@id="layers"]/div[2]/div/div/div/div[2]/div/div[3]/div/div/div/div[3]'
```

## 🚨 주의사항

### 성능 고려사항
- **새로고침 주기**: 너무 짧은 주기(1-5초)는 높은 CPU 사용률과 네트워크 사용량을 유발할 수 있습니다
- **권장 설정**: 10-30초 주기 사용을 권장합니다

### 기술적 제한사항
- **X UI 변경**: X의 인터페이스 업데이트 시 XPath가 변경되어 일시적으로 작동하지 않을 수 있습니다
- **네트워크 의존성**: 느린 인터넷 연결 시 클릭 간 대기시간을 늘려야 할 수 있습니다

### 개인정보 보호
- ✅ 모든 설정은 브라우저 로컬에만 저장
- ✅ 외부 서버와 통신하지 않음
- ✅ 최소한의 권한만 사용

## 🔍 문제 해결

### 일반적인 문제
1. **기능이 작동하지 않는 경우**
   - 마스터 버튼을 OFF → ON으로 토글
   - 페이지 새로고침 후 재시도

2. **스페이스 감지가 안 되는 경우**
   - 실제로 스페이스를 청취하고 있는지 확인
   - "참여했습니다" 텍스트가 표시되는지 확인

3. **느린 동작**
   - 클릭 간 대기시간을 1000ms 이상으로 증가
   - 새로고침 주기를 30초 이상으로 증가

### 디버깅
개발자 도구(F12) → Console 탭에서 다음 로그 확인:
- `Tab {id} detection started`: 감지 시작
- `Tab {id} performing refresh actions`: 정렬 작업 실행
- `Tab {id} reply settings button clicked`: 설정 버튼 클릭 성공
- `Tab {id} latest sort button clicked`: 정렬 버튼 클릭 성공

## 🤝 기여하기

### 버그 리포트
이슈를 등록할 때 다음 정보를 포함해 주세요:
- Chrome 버전
- 확장 프로그램 버전 (0.1.0)
- 재현 단계
- 콘솔 오류 메시지
- 스크린샷

### 개발 참여
1. 저장소를 포크합니다
2. 기능 브랜치를 생성합니다 (`git checkout -b feature/amazing-feature`)
3. 변경사항을 커밋합니다 (`git commit -m 'Add amazing feature'`)
4. 브랜치에 푸시합니다 (`git push origin feature/amazing-feature`)
5. Pull Request를 생성합니다

## 📄 라이선스

이 프로젝트는 MIT 라이선스 하에 배포됩니다. 자세한 내용은 `LICENSE` 파일을 참조하세요.

## 🙏 크레딧

이 프로젝트는 [Chrome Extension CLI](https://github.com/dutiyesh/chrome-extension-cli)를 기반으로 제작되었습니다.

---

<div align="center">

**Made with ❤️ for X Space users**

[� 버그 신고](../../issues) • [� 기능 제안](../../issues) • [⭐ 별점 주기](../../stargazers)

</div>
