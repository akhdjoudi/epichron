import Report from "@/components/Report";
import Workstation from "@/components/Workstation";
import type { Marker, Metrics, Shap, SplitMetrics, Weights } from "@/lib/clock";
import markersData from "../../public/data/markers.json";
import metricsData from "../../public/data/metrics.json";
import shapData from "../../public/data/shap.json";
import weightsData from "../../public/data/cpg_weights.json";

const weights = weightsData as unknown as Weights;
const metrics = metricsData as unknown as Metrics;
const shap = shapData as unknown as Shap;
const markers = (markersData as unknown as { markers: Marker[] }).markers;

const externalMae = (model: string) => (metrics[model]?.external as SplitMetrics | undefined)?.mae ?? 0;

export default function Home() {
  return (
    <main className="flex-1">
      <Workstation weights={weights} mae={{ elasticnet: externalMae("elasticnet"), lightgbm: externalMae("lightgbm") }} />
      <Report metrics={metrics} markers={markers} shap={shap} />
    </main>
  );
}
