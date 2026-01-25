import AxisBars from "./AxisBars";
import styles from "./PlatformMap.module.css";
import { PlatformNewsItem, SigunguRating } from "../../lib/platform-map/types";

type Props = {
  rating?: SigunguRating | null;
  newsItems: PlatformNewsItem[];
};

export default function PlatformMapDetail({ rating, newsItems }: Props) {
  if (!rating) {
    return <div className={styles.emptyState}>지도를 선택하면 상세 정보를 표시합니다.</div>;
  }

  const drivers = rating.evidence.signals.filter((s) => s.impact === "+").slice(0, 3);
  const risks = rating.evidence.signals.filter((s) => s.impact === "-").slice(0, 3);

  return (
    <div>
      <div>
        <strong>{rating.sigunguName}</strong> · 등급 {rating.grade} · 점수 {rating.score}
      </div>
      <div className={styles.newsMeta}>업데이트: {rating.updatedAt}</div>

      <h4>12축 점수</h4>
      <AxisBars axes={rating.axes} />

      <h4>Top drivers</h4>
      {drivers.length ? (
        <ul>
          {drivers.map((signal, index) => (
            <li key={`${signal.tag}-${index}`}>{signal.tag}</li>
          ))}
        </ul>
      ) : (
        <div className={styles.emptyState}>신호 없음</div>
      )}

      <h4>Risks</h4>
      {risks.length ? (
        <ul>
          {risks.map((signal, index) => (
            <li key={`${signal.tag}-${index}`}>{signal.tag}</li>
          ))}
        </ul>
      ) : (
        <div className={styles.emptyState}>신호 없음</div>
      )}

      <h4>근거</h4>
      <div>{rating.evidence.notes || "근거 없음"}</div>
      {rating.evidence.links.length ? (
        <ul>
          {rating.evidence.links.map((link) => (
            <li key={link.url}>
              <a href={link.url} target="_blank" rel="noreferrer">
                {link.title}
              </a>{" "}
              ({link.date})
            </li>
          ))}
        </ul>
      ) : (
        <div className={styles.emptyState}>링크 없음</div>
      )}

      <h4>최근 뉴스</h4>
      <div className={styles.newsList}>
        {newsItems.length ? (
          newsItems.map((item) => (
            <div key={item.url} className={styles.newsItem}>
              <a href={item.url} target="_blank" rel="noreferrer">
                {item.title}
              </a>
              <div className={styles.newsMeta}>
                {item.date} · {item.source}
              </div>
            </div>
          ))
        ) : (
          <div className={styles.emptyState}>최근 뉴스가 없습니다.</div>
        )}
      </div>
    </div>
  );
}
