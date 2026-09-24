interface Props {
  width?: string | number;
  height?: number;
}

export default function Skeleton({ width = "100%", height = 14 }: Props) {
  return <div className="skeleton" style={{ width, height }} />;
}
