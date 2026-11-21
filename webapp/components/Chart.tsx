"use client";
// Apache ECharts sarmalayıcısı: yalnız tarayıcıda yüklenir, kapsayıcı boyutu değişince yeniden çizer.
import { useEffect, useRef } from "react";
import type { EChartsOption } from "echarts";

export default function Chart({ option, height = 280, label }: { option: EChartsOption; height?: number; label: string }) {
  const el = useRef<HTMLDivElement>(null);
  const chart = useRef<import("echarts").ECharts | null>(null);

  useEffect(() => {
    let disposed = false;
    let ro: ResizeObserver | null = null;
    import("echarts").then(ec => {
      if (disposed || !el.current) return;
      chart.current = ec.init(el.current, undefined, { renderer: "svg" });
      chart.current.setOption(option);
      ro = new ResizeObserver(() => chart.current?.resize());
      ro.observe(el.current);
    });
    return () => { disposed = true; ro?.disconnect(); chart.current?.dispose(); chart.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { chart.current?.setOption(option, { notMerge: true }); }, [option]);

  return <div ref={el} role="img" aria-label={label} style={{ height }} className="w-full" />;
}
