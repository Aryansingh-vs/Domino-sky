'use client'

import { useMemo } from "react"
import { Pause, Play } from "lucide-react"
import { crews, formatTime, schedule, spareAircraft, toMinutes, type Simulation } from "@/src/engine"

const dayStart = 5 * 60
const dayEnd = 23 * 60
const duration = dayEnd - dayStart
const position = (minutes: number) => Math.max(0, Math.min(100, ((minutes - dayStart) / duration) * 100))

export default function FlightTimeline({ result, replayMinute, onReplayChange, playing, onPlayToggle, onSelectFlight }: { result: Simulation; replayMinute: number; onReplayChange: (minute: number) => void; playing: boolean; onPlayToggle: () => void; onSelectFlight: (id: string) => void }) {
  const tails = useMemo(() => [...new Set([...schedule.map(flight => flight.tail_id), ...spareAircraft.map(spare => spare.tail_id)])], [])
  const affected = result.flights.filter(flight => flight.departureDelay > 0 || flight.arrivalDelay > 0)
  const lateAtTime = affected.filter(flight => flight.scheduledDep <= replayMinute && flight.actualDep > replayMinute)
  const closureLeft = position(toMinutes(result.scenario.start)), closureRight = position(toMinutes(result.scenario.end))
  return <section className="panel timeline-panel" aria-labelledby="timeline-title">
    <div className="panel-headline"><div><p className="eyebrow">AIRCRAFT ROTATIONS</p><h2 id="timeline-title">Schedule &amp; actual</h2></div><div className="timeline-legend"><span><i className="legend-scheduled"/>Scheduled</span><span><i className="legend-actual"/>Actual</span><span><i className="legend-delay"/>Delay</span></div></div>
    <div className="timeline-scroll"><div className="timeline-inner">
      <div className="time-axis"><div className="tail-label">AIRCRAFT</div><div className="axis-track">{Array.from({ length: 19 }, (_, index) => dayStart + index * 60).map(minute => <span key={minute} style={{ left: `${position(minute)}%` }}>{formatTime(minute)}</span>)}</div></div>
      {tails.map(tail => {
        const flights = result.flights.filter(flight => flight.tail_id === tail).sort((a, b) => a.actualDep - b.actualDep)
        const crew = crews.find(item => item.tail_id === tail)
        const breach = crew ? result.crews.find(item => item.crew_id === crew.crew_id)?.breach : false
        const dutyLimit = crew ? toMinutes(crew.duty_start) + crew.max_duty_mins : null
        return <div className="timeline-row" key={tail}>
          <div className="tail-label"><strong>{tail.replace("VT-", "")}</strong><small>{crew?.crew_id ?? "SPARE"}</small></div>
          <div className="timeline-track">
            <div className="closure-shade" style={{ left: `${closureLeft}%`, width: `${Math.max(0, closureRight - closureLeft)}%` }} aria-hidden="true"/>
            {breach && dutyLimit !== null && <div className="duty-marker" style={{ left: `${position(dutyLimit)}%` }} title={`${crew?.crew_id} duty limit`} aria-label={`${crew?.crew_id} duty limit at ${formatTime(dutyLimit)}`}/>}
            {flights.map(flight => {
              const scheduleLeft = position(flight.scheduledDep), scheduleWidth = Math.max(.55, position(flight.scheduledArr) - scheduleLeft)
              const actualLeft = position(flight.actualDep), actualWidth = Math.max(.55, position(flight.actualArr) - actualLeft)
              const delayWidth = Math.max(0, actualLeft - scheduleLeft)
              return <div className="flight-bar-group" key={flight.flight_id}>
                <div className="scheduled-bar" style={{ left: `${scheduleLeft}%`, width: `${scheduleWidth}%` }} aria-hidden="true"/>
                {delayWidth > 0 && <div className="delay-bar" style={{ left: `${scheduleLeft}%`, width: `${delayWidth}%` }} aria-hidden="true"/>}
                <button className={`actual-bar ${flight.status === "Cancelled" ? "bar-cancelled" : flight.departureDelay > 0 ? "bar-delayed" : "bar-on-time"}`} style={{ left: `${actualLeft}%`, width: `${actualWidth}%` }} onClick={() => onSelectFlight(flight.flight_id)} title={`${flight.flight_id}: ${formatTime(flight.actualDep)}–${formatTime(flight.actualArr)}${flight.departureDelay ? `, ${flight.departureDelay} minutes late` : ""}`} aria-label={`Open ${flight.flight_id}, ${flight.origin} to ${flight.destination}, ${formatTime(flight.actualDep)} to ${formatTime(flight.actualArr)}`}><span>{flight.flight_id}</span></button>
              </div>
            })}
          </div>
        </div>
      })}
    </div></div>
    <div className="replay-control"><button className="icon-button play-button" onClick={onPlayToggle} aria-label={playing ? "Pause cascade replay" : "Play cascade replay"}>{playing ? <Pause size={15}/> : <Play size={15}/>}</button><div className="replay-content"><div className="replay-label"><strong>Cascade replay</strong><span>{formatTime(replayMinute)} IST · {lateAtTime.length} flights currently held</span></div><input aria-label="Replay time of day" type="range" min={dayStart} max={dayEnd} value={replayMinute} onChange={event => onReplayChange(Number(event.target.value))}/></div></div>
    <p className="replay-flights">{lateAtTime.length ? lateAtTime.map(flight => flight.flight_id).join(" · ") : "No delayed aircraft awaiting departure at this time."}</p>
  </section>
}
