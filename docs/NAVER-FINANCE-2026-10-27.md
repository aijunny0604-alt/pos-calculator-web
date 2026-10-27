# 네이버 정산·부가세 조회

- 스마트스토어 주문 → 정산·부가세에서 일별 정산, 건별 정산, 수수료 상세, 건별 부가세를 조회한다. 무비스의 `getStoreFinanceDetails`도 동일한 자료를 페이지 단위로 읽는다.
- 일별 정산은 정산 예정일과 완료일을 분리한다. 건별 정산과 수수료는 단일 정산 기준일 및 선택적인 네이버 주문번호로 조회한다. 부가세는 네이버 정책상 전월 말일까지 조회하며 과세 매출을 납부세액으로 표시하지 않는다.
- 결과는 네이버 원본의 확정/예정 구분과 금액을 그대로 표시하며, 페이지 단위 목록을 전체 합계로 합산하지 않는다. 빈 값은 `미제공`이다. 계좌번호·예금주·구매자명은 브리지에서 제외한다.
- 매장 PC `bridge/store-care.mjs`를 최신 버전으로 실행해야 한다. 읽기 전용 API이며 조회 실패·권한 오류와 정상 빈 결과를 구분한다. 재시작 후 자동 실행은 별도 설정하지 않았다.
- 무비스 `getStoreClaims`는 기존 동기화 주문 및 상품별 클레임의 진행 중 취소·반품·교환 요청을 조회한다. 한 주문의 서로 다른 상품 요청을 구분한다. 승인·환불을 실행하지 않는다.
- 2026-10-27 실제 네이버 계정에서 건별 정산 2건, 수수료 상세 4건, 9월 건별 부가세 29건 읽기 조회 성공. 개인 정보 및 금액을 시험 로그에 기록하지 않았다.
- GPT-6.1 Sol에 가상 부가세 API 응답을 전달해 조회 도구 호출과 과세 매출·납부세액 구분을 검증했다. PC 1366×768, 모바일 390×844·360×800 Chromium 샘플에서 네 종류 조회, 상세 열기와 가로 넘침을 확인했다. 실제 모바일·Safari, 장기간 정산 총액 대사는 미검증이다.
- [건별 정산](https://apicenter.commerce.naver.com/docs/commerce-api/current/find-settle-by-case-pay-settle), [수수료 상세](https://apicenter.commerce.naver.com/docs/commerce-api/current/find-commission-details-pay-settle), [건별 부가세](https://apicenter.commerce.naver.com/docs/commerce-api/current/find-vat-declaration-by-case-pay-settle).
