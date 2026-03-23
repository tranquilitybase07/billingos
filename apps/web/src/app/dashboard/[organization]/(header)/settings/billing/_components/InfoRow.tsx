interface InfoRowProps {
  label: string
  value: React.ReactNode
}

export function InfoRow({ label, value }: InfoRowProps) {
  return (
    <div className="flex items-center justify-between py-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  )
}
