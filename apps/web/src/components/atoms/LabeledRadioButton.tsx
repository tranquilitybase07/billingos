import { twMerge } from 'tailwind-merge'

const LabeledRadioButton = (props: {
  values: string[]
  value: string
  onSelected: (value: string) => void
}) => {
  const vals = props.values.map((v) => {
    return {
      label: v,
      selected: v === props.value,
    }
  })

  return (
    <div className="bg-card text-muted-foreground flex flex-row rounded-lg text-sm">
      {vals.map((v) => {
        return (
          <div
            key={v.label}
            onClick={() => props.onSelected(v.label)}
            className={twMerge(
              v.selected
                ? 'bg-muted text-foreground rounded-lg shadow-sm'
                : '',
              'cursor-pointer rounded-lg px-2.5 py-1.5',
            )}
          >
            {v.label}
          </div>
        )
      })}
    </div>
  )
}

export default LabeledRadioButton
