import styles from "./PlatformMap.module.css";
import { PlatformAxis, SigunguRating } from "../../lib/platform-map/types";

type Props = {
  ratings: SigunguRating[];
  selectedCode?: string | null;
  selectedAxis?: PlatformAxis | null;
  onSelect: (code: string) => void;
};

export default function PlatformMapList({ ratings, selectedCode, selectedAxis, onSelect }: Props) {
  return (
    <div className={styles.list}>
      {ratings.map((rating) => {
        const axisValue = selectedAxis ? rating.axes[selectedAxis] : null;
        return (
          <div
            key={rating.sigunguCode}
            className={`${styles.listItem} ${rating.sigunguCode === selectedCode ? styles.listItemActive : ""}`}
            onClick={() => onSelect(rating.sigunguCode)}
          >
            <div>
              <div>{rating.sigunguName}</div>
              {axisValue !== null && <div className={styles.newsMeta}>축 점수: {axisValue}</div>}
            </div>
            <div>
              <span className={styles.badge}>{rating.grade}</span>
              <div>{rating.score}</div>
            </div>
          </div>
        );
      })}
      {!ratings.length && <div className={styles.emptyState}>표시할 지역이 없습니다.</div>}
    </div>
  );
}
