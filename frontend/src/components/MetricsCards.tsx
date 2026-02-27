"use client";

interface Props {
    entitiesCount: number;
    risksCount: number;
    iteration: number;
    costUsd?: number;
}

const metrics = [
    {
        key: "entities",
        label: "Entities Discovered",
        color: "text-amber-400",
    },
    {
        key: "risks",
        label: "Risk Flags",
        color: "text-red-400",
    },
    {
        key: "iteration",
        label: "Search Iterations",
        color: "text-emerald-400",
    },
    {
        key: "cost",
        label: "Est. Cost (USD)",
        color: "text-orange-400",
    },
] as const;

export function MetricsCards({ entitiesCount, risksCount, iteration, costUsd = 0 }: Props) {
    const values: Record<string, string | number> = {
        entities: entitiesCount,
        risks: risksCount,
        iteration,
        cost: costUsd > 0 ? `$${costUsd.toFixed(3)}` : "$0.000",
    };

    return (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
            {metrics.map((m) => (
                <div
                    key={m.key}
                    className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-center sm:py-3"
                >
                    <div className={`text-2xl font-bold sm:text-3xl ${m.color}`}>
                        {values[m.key]}
                    </div>
                    <div className="mt-0.5 text-[10px] text-neutral-500 sm:mt-1 sm:text-xs">
                        {m.label}
                    </div>
                </div>
            ))}
        </div>
    );
}
