interface LogoProps {
  size?: number;
  className?: string;
}

export function Logo({ size = 60, className = '' }: LogoProps) {
  return (
    <div className={`flex items-center justify-center ${className}`}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 100 100"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Simple circle logo similar to Polar's style */}
        <circle
          cx="50"
          cy="50"
          r="45"
          className="fill-blue-600 dark:fill-blue-500"
        />
        <text
          x="50"
          y="50"
          textAnchor="middle"
          dominantBaseline="central"
          className="fill-white font-bold"
          style={{ fontSize: '32px' }}
        >
          B
        </text>
      </svg>
    </div>
  );
}

export default Logo;
