# 캠퍼스 대시보드 + 통계분석 합치기 계획

## 목표
캠퍼스 통계분석 페이지(`/campus/analytics`)를 캠퍼스 대시보드(`/campus/dashboard`)에 합치고, 탭 2개로 재구성

## 현재 구조

```
dashboard/page.tsx (766줄)
├── 상단 2열 그리드 (54% 높이)
│   ├── Q1: 개설반 현황 (유치부/방과후/초등부 + 월별입퇴소 미니차트)
│   └── Q3: 연차 현황 (이번주캘린더 + 승인대기/승인내역)
└── 하단: 호차별 탑승 현황 (등원/하원 토글)

analytics/page.tsx (659줄)
├── 탭1 통계분석
│   ├── KPI 4개 (총학생수/초등부/유치부/최다거주지)
│   ├── 학년별 차트 (Chart.js bar)
│   ├── 동별/학교별 랭크바 (2열)
│   ├── 아파트별 차트 (Chart.js horizontal bar)
│   ├── 아파트×학년 크로스테이블
│   ├── 레벨 분포 차트 (Chart.js bar)
│   └── 학생검색 테이블 ← 삭제 예정
└── 탭2 월별 입퇴소
    ├── 당월 KPI (입소/퇴소/누적)
    ├── 추이 바차트 (TrendBarChart)
    └── 월별 입퇴소 상세 테이블
```

## 변경 후 구조

```
dashboard/page.tsx (통합)
├── 헤더 (캠퍼스 대시보드 + 연도선택)
├── 탭 2개: [운영 현황] [통계 분석]
│
├── 탭1: 운영 현황
│   ├── 연차 현황 (기존 Q3 그대로)
│   └── 호차별 탑승 현황 (기존 하단 그대로)
│
└── 탭2: 통계 분석
    ├── XLS 업로드 버튼 + 상태
    ├── KPI 4개
    ├── 학년별 차트
    ├── 동별/학교별 랭크바
    ├── 아파트별 차트
    ├── 아파트×학년 크로스테이블
    ├── 레벨 분포 차트
    └── 월별 입퇴소 (스크롤 아래, 별도탭X)
        ├── 당월 KPI
        ├── 추이 바차트
        └── 상세 테이블
```

## 변경 사항 상세

### 1. 개설반 현황 섹션 삭제
- dashboard의 Q1(개설반 현황) QuadCard 전체 제거 (라인 365-457)
- `RosterStatCard` 컴포넌트 제거
- `openEnrollModal`, `enrollModal` 관련 state/handler/modal 제거
- roster 관련 변수들 제거 (유치부Stats, 방과후Stats 등)
- `SessionStat` 인터페이스 유지할 필요 없으면 제거
- API에서 roster 데이터 아직 사용하지만, 통계분석 탭이 별도 API를 씀

### 2. 탭 구조 추가
- `tab` state 추가: `'operation' | 'analytics'`
- 탭 UI: 상단 헤더 아래에 2버튼 탭 (운영 현황 / 통계 분석)

### 3. 탭1 "운영 현황"
- 기존 연차 현황 (Q3) 내용 → 전체 너비로 배치
- 기존 호차별 탑승 현황 → 연차 현황 아래

### 4. 탭2 "통계 분석"
- analytics/page.tsx의 통계분석 콘텐츠 이동
- 학생검색 섹션 제거 (이 데이터는 개설반현황 전체학생 목록에서 매칭 예정 → 별도 작업)
- 월별 입퇴소: 별도 탭 대신 통계분석 하단에 이어서 배치
- analytics의 state/effect/handler 모두 이동
  - dbStudents, xlsStudents, grandSessTotal, yuchibuCount, chodeungCount
  - trendData, currEnrolled/currWithdrawn, totalEnrolled/totalWithdrawn
  - Chart.js useEffect (gradeChart, aptChart, levelChart)
  - handleImport, XLS parsing
  - processDb, processRaw, countBy, normalizeGrade 등 유틸함수

### 5. 이동할 컴포넌트/함수
analytics → dashboard로 이동:
- 타입: `DbStudent`, `RawStudent`, `HistLog`, `TrendPoint`, `Processed`
- 상수: `GRADE_ORDER`, 색상(BG/SURFACE/SURFACE2 등은 dashboard 스타일에 맞춤)
- 유틸: `normalizeGrade`, `normalizeLevel`, `extractAptFromDetail`, `extractDongFromDetail`, `ageGroup`, `parseXLSText`, `processRaw`, `processDb`, `countBy`
- 컴포넌트: `RankBars`, `TrendBarChart`

### 6. 삭제할 파일
- `app/(campus)/campus/analytics/page.tsx` → 삭제
- 사이드바에서 통계분석 메뉴 → 대시보드로 리다이렉트 or 제거

### 7. API 변경
- `/api/campus/analytics` 유지 (통계분석 탭에서 호출)
- `/api/campus/dashboard` 유지 (운영현황 탭에서 호출)
- API 수정 불필요

### 8. 사이드바/네비게이션 업데이트
- analytics 메뉴 항목 제거 또는 dashboard로 리다이렉트

## 작업 순서

1. dashboard/page.tsx에 analytics 유틸/타입/컴포넌트 복사
2. dashboard에 탭 state + UI 추가
3. 개설반 현황 섹션 제거
4. 탭1(운영 현황): 연차+호차별을 전체너비로 재배치
5. 탭2(통계 분석): analytics 콘텐츠 이식 (학생검색 제외, 월별입퇴소 하단 통합)
6. analytics/page.tsx 삭제 또는 리다이렉트
7. 사이드바 메뉴 업데이트
8. 빌드 확인 + 배포
