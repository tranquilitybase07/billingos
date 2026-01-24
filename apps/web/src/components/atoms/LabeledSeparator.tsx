interface LabeledSeparatorProps {
  label: string
}

const LabeledSeparator: React.FC<LabeledSeparatorProps> = ({ label }) => {
  return (
    <div className="flex w-full flex-row items-center gap-6">
      <div className="border-border grow border-t"></div>
      <div className="text-muted-foreground text-sm">{label}</div>
      <div className="border-border grow border-t"></div>
    </div>
  )
}

export default LabeledSeparator
