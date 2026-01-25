import PlatformMapPage from "../../../components/platform-map/PlatformMapPage";

type Props = {
  params: { sigungu: string };
};

export default function Page({ params }: Props) {
  return <PlatformMapPage initialSigunguCode={params.sigungu} />;
}
