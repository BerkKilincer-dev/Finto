import type { CSSProperties } from 'react';

type SkeletonProps = {
  width?: string | number;
  height?: string | number;
  rounded?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'full';
  className?: string;
  style?: CSSProperties;
  /** Ekran okuyucu için görünmez etiket. Kullanıcı yükleniyor olduğunu duysun. */
  label?: string;
};

const ROUND_MAP: Record<NonNullable<SkeletonProps['rounded']>, string> = {
  sm: 'rounded-sm',
  md: 'rounded-md',
  lg: 'rounded-lg',
  xl: 'rounded-xl',
  '2xl': 'rounded-2xl',
  full: 'rounded-full',
};

/**
 * Yüklenirken yer tutucu kutu. Animasyonlu pulse + aria-busy.
 * Ekran okuyucu kullanıcısı için görünmez bir "yükleniyor" etiketi ister isteğe bağlı verilebilir.
 */
export function Skeleton({
  width = '100%',
  height = '1rem',
  rounded = 'md',
  className = '',
  style,
  label,
}: SkeletonProps) {
  return (
    <span
      role="status"
      aria-busy="true"
      aria-label={label}
      className={`inline-block bg-slate-200 dark:bg-slate-700 animate-pulse ${ROUND_MAP[rounded]} ${className}`}
      style={{ width, height, ...style }}
    />
  );
}

/** Dashboard tarzı kart yer tutucusu. */
export function CardSkeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Yükleniyor"
      className="border border-slate-200 dark:border-slate-700 rounded-2xl p-4 space-y-2 bg-white dark:bg-slate-800"
    >
      <Skeleton height="0.75rem" width="40%" />
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} height="1rem" width={`${60 + ((i * 17) % 30)}%`} />
      ))}
    </div>
  );
}
