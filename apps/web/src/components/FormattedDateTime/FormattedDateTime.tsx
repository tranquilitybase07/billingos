interface FormattedDateTimeProps {
  datetime: string
  resolution?: 'day' | 'minute' | 'second'
}

const FormattedDateTime: React.FC<FormattedDateTimeProps> = ({
  datetime,
  resolution = 'day',
}) => {
  const date = new Date(datetime)

  const formatOptions: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    ...(resolution !== 'day' && {
      hour: '2-digit',
      minute: '2-digit',
      ...(resolution === 'second' && { second: '2-digit' }),
    }),
  }

  return <>{date.toLocaleDateString('en-US', formatOptions)}</>
}

export default FormattedDateTime
