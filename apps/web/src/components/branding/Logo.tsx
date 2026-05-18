interface LogoProps {
  size?: number;
  className?: string;
}

export function Logo({ size = 60, className = '' }: LogoProps) {
  return (
    <div className={`flex items-center justify-center ${className}`} style={{ width: size, height: size }}>
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 217 218"
        fill="none"
        className="w-full h-full"
      >
        <path d="M41.5 193.5L22 174.5L73.5 121.5H0.5V94H75L21.5 42L41 22L93.5 74.5V0.5H122V74.5L174.5 22L194 42L142 94H216.5V122H126C123.381 123.252 122.422 124.382 122 127.5V217H93.5V142L41.5 193.5Z" fill="#1570EF" stroke="#1570EF" />
        <rect x="159.016" y="139.862" width="54.2889" height="28.145" rx="14.0725" transform="rotate(44 159.016 139.862)" className="fill-black dark:fill-white" />
      </svg>
    </div>
  );
}

export default Logo;
