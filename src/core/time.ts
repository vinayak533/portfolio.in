import { useEffect, useState } from 'react'
import { site } from '../content'

const fmt = new Intl.DateTimeFormat('en-GB', {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
  timeZone: site.timezone,
})

export function useLocalTime() {
  const [now, setNow] = useState(() => fmt.format(new Date()))
  useEffect(() => {
    const id = window.setInterval(() => setNow(fmt.format(new Date())), 1000)
    return () => window.clearInterval(id)
  }, [])
  return now
}
