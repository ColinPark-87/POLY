# 스마트보드 PC 설치 가이드

반마다 1회만 설정하면 됩니다.

---

## 0단계: 교실 계정 발급 (관리자)

Supabase 대시보드 → Authentication → Users → "Add user":
- Email: `room-<반이름>@poly.jungkye` (예: `room-s1@poly.jungkye`)
- Password: 관리자 보관
- User metadata (JSON):

```json
{
  "role": "smartboard",
  "class_id": "<classes 테이블의 해당 반 UUID>",
  "campus_id": "<campuses 테이블의 캠퍼스 UUID>"
}
```

---

## 1단계: Chrome 시작프로그램 등록

1. `Win + R` → `shell:startup` 입력 → Enter
2. 빈 곳 우클릭 → 새로 만들기 → 바로가기
3. 위치에 붙여넣기:

```
"C:\Program Files\Google\Chrome\Application\chrome.exe" --app=https://poly-system.vercel.app/smartboard --start-minimized
```

4. 이름: `출석시스템` → 마침

---

## 2단계: 최초 로그인

1. 바탕화면의 `출석시스템` 바로가기 더블클릭
2. 해당 교실 계정으로 로그인
3. "대기 중..." 화면 → 설정 완료

이후 PC 재부팅 시 자동 실행 + 자동 로그인.

---

## 작동 방식

- 수업 시작 2분 전 자동으로 화면이 올라옵니다
- 결석·지각 학생을 탭하여 표시 (기본값: 전원 출석)
- [출석 완료] 버튼을 눌러야 저장 및 화면이 내려갑니다
- 상담부 탭에서 사전 결석 등록 시 스마트보드에 자동 반영됩니다

---

## 문제 해결

| 증상 | 해결 |
|------|------|
| 팝업이 안 뜸 | 작업표시줄에서 Chrome 확인, 없으면 바로가기 더블클릭 |
| 로그인 화면이 뜸 | 해당 교실 계정으로 다시 로그인 |
| 학생 명단이 다름 | 개설반 현황에서 학생 수정 → 자동 반영 |
| 출결이 안 저장됨 | 인터넷 연결 확인 후 [출석 완료] 재시도 |
