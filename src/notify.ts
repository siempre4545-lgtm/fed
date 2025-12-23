import { fetchH41Report, toKoreanDigest } from "./h41.js";

/**
 * 이메일 알림용 포맷팅
 * - 경고 레벨 + 국면 한 줄 요약
 * - 자산군 대응 가이드 문장
 * - 청팀/백팀 시그널
 * - 핵심 6개 수치 요약
 * - (주 1회) 주간 요약 리포트 전문
 */
function formatEmailReport(report: Awaited<ReturnType<typeof fetchH41Report>>): string {
  const levelText = ["안정", "주의", "경계", "위험"][report.warningLevel];
  
  const parts = [
    "=".repeat(50),
    "FED H.4.1 유동성 대시보드 - 이메일 알림",
    "=".repeat(50),
    "",
    `[경고 레벨] LEVEL ${report.warningLevel} (${levelText})`,
    "",
    `[국면 한 줄 요약]`,
    `이번 주는 ${levelText} 국면으로 평가됩니다.`,
    "",
    `[자산군 대응 가이드]`,
    report.assetGuidance,
    "",
    `[청팀/백팀 시그널]`,
    report.teamSignal.summary,
    `- 청팀: ${report.teamSignal.blueTeam}`,
    `- 백팀: ${report.teamSignal.whiteTeam}`,
    "",
    `[핵심 6개 수치 요약]`,
    ...report.coreCards.flatMap(c => {
      const chSign = c.change_okeusd > 0 ? "+" : c.change_okeusd < 0 ? "-" : "";
      return [
        `  ${c.key} ${c.title}`,
        `    잔액: $${c.balance_okeusd.toFixed(1)}억`,
        `    변동: ${chSign}$${Math.abs(c.change_okeusd).toFixed(1)}억`,
        `    ${c.interpretation}`,
        ""
      ];
    }),
    "",
    `[주간 요약 리포트]`,
    report.weeklySummary,
    "",
    "=".repeat(50),
    `Release: ${report.releaseDateText}`,
    `Week ended: ${report.asOfWeekEndedText}`,
    `Source: ${report.sourceUrl}`,
    `Updated: ${report.updatedAtISO}`,
    "",
    "※ 이 메일은 거시 환경 해석용 참고 자료입니다.",
    "※ 특정 종목 추천이 아닌 유동성 시그널 해석 도구입니다."
  ];

  return parts.flat().join("\n");
}

async function main() {
  const report = await fetchH41Report();
  
  // 1) 콘솔 출력 (기본)
  console.log("=".repeat(60));
  console.log("FED H.4.1 데일리 리포트");
  console.log("=".repeat(60));
  console.log(toKoreanDigest(report));
  
  // 2) 이메일 형식 출력
  console.log("\n\n");
  console.log("=".repeat(60));
  console.log("이메일 알림 형식");
  console.log("=".repeat(60));
  console.log(formatEmailReport(report));
  
  // 3) 여기에 실제 이메일 전송 로직을 추가할 수 있습니다
  //    예: nodemailer, SendGrid, AWS SES 등
  //    const emailContent = formatEmailReport(report);
  //    await sendEmail({
  //      to: "user@example.com",
  //      subject: `FED H.4.1 리포트 - LEVEL ${report.warningLevel} (${levelText})`,
  //      text: emailContent
  //    });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
