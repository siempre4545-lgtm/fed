import styles from "./PlatformMap.module.css";
import { PLATFORM_AXES, PlatformAxisScores } from "../../lib/platform-map/types";

type Props = {
  axes: PlatformAxisScores;
};

export default function AxisBars({ axes }: Props) {
  return (
    <div className={styles.axisBars}>
      {PLATFORM_AXES.map((axis) => {
        const value = axes[axis];
        return (
          <div key={axis} className={styles.axisBarRow}>
            <div>{axis}</div>
            <div className={styles.axisTrack}>
              <div className={styles.axisFill} style={{ width: `${Math.min(100, value)}%` }} />
            </div>
            <div>{value}</div>
          </div>
        );
      })}
    </div>
  );
}
