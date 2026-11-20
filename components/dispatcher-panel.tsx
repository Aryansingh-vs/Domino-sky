'use client'

import { FormEvent, useState } from "react"
import useSWR from "swr"
import { ArrowDownRight, Check, CircleHelp, CornerDownLeft, LoaderCircle, RotateCcw, Sparkles } from "lucide-react"
import { scoreWeights, type Action, type Scenario, type Simulation } from "@/src/engine"
import type { Candidate } from "@/src/engine/recovery"

type DispatcherResponse = { explanation?: { recommended_action_id: string; summary: string; why: string[]; numbers_cited: Array<number | string> }; verified?: boolean; template?: boolean }
const fetcher = async (key: string): Promise<DispatcherResponse> => {
  const response = await fetch("/api/dispatcher", { method: "POST", headers: { "Content-Type": "application/json" }, body: key })
  if (!response.ok) throw new Error("Dispatcher explanation request failed.")
  return response.json()
}

export default function DispatcherPanel({ scenario, current, baseline, recommendations, activeAction, onApply, onUndo }: { scenario: Scenario; current: Simulation; baseline: Simulation; recommendations: Candidate[]; activeAction: Action | null; onApply: (action: Action | null) => void; onUndo: () => void }) {
  const { data, isLoading } = useSWR(JSON.stringify({ scenario }), fetcher, { revalidateOnFocus: false, keepPreviousData: true })
  const [question, setQuestion] = useState("")
  const [answer, setAnswer] = useState("")
  const [answerVerified, setAnswerVerified] = useState(false)
  const [chatPending, setChatPending] = useState(false)
  const explanation = data?.explanation
  const submitQuestion = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const text = question.trim()
    if (!text || chatPending) return
    setChatPending(true)
    try {
      const response = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scenario, question: text, actions: activeAction ? [activeAction] : [] }) })
      if (!response.ok) throw new Error("Question request failed.")
      const payload: unknown = await response.json()
      if (!payload || typeof payload !== "object" || !("answer" in payload) || typeof payload.answer !== "string") {
        throw new Error("The dispatcher returned an invalid answer.")
      }
      setAnswer(payload.answer)
      setAnswerVerified("verified" in payload && payload.verified === true)
    } catch {
      setAnswer("I could not verify an answer from this scenario.")
      setAnswerVerified(false)
    } finally {
      setQuestion("")
      setChatPending(false)
    }
  }
  const afterMetrics = activeAction ? current : baseline
  return <section className="panel dispatcher-panel" aria-labelledby="dispatcher-title">
    <div className="dispatcher-title"><div className="dispatcher-icon"><Sparkles size={17}/></div><div><p className="eyebrow">RECOVERY DESK / SINGLE-ACTION EVALUATION</p><h2 id="dispatcher-title">AI dispatcher</h2></div><span className={`verification ${data?.verified ? "verified" : "template"}`}>{data?.verified ? <Check size={12}/> : <CircleHelp size={12}/>} {data?.verified ? "Verified: all figures match the simulation" : "Template explanation"}</span></div>
    <div className="dispatcher-summary" aria-live="polite">{isLoading ? <span className="skeleton-line"/> : <><p>{explanation?.summary ?? `The closure yields ${baseline.delayedFlights} delayed flights and ${baseline.strandedPax} stranded passengers.`}</p>{explanation?.why?.length ? <ul>{explanation.why.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}</ul> : null}</>}</div>
    <div className="score-weights" aria-label="Recovery score weights"><span>Score weights</span><b>Delay min × {scoreWeights.depDelayMinute}</b><b>Stranded pax × {scoreWeights.strandedPassenger}</b><b>Crew breach × {scoreWeights.crewBreach}</b><b>Cancellation × {scoreWeights.cancellation}</b></div>
    <div className="action-grid">
      {recommendations.length ? recommendations.map((candidate, index) => <article className={`action-card ${activeAction && JSON.stringify(activeAction) === JSON.stringify(candidate.action) ? "applied" : ""}`} key={candidate.id}>
        <div className="action-rank">RECOVERY {String(index + 1).padStart(2, "0")}</div><h3>{candidate.label}</h3><div className="action-score">Score <strong>{candidate.score}</strong><span><ArrowDownRight size={13}/>{candidate.improvement} better</span></div>
        <button className="apply-action" onClick={() => onApply(candidate.action)} disabled={Boolean(activeAction)}>{activeAction && JSON.stringify(activeAction) === JSON.stringify(candidate.action) ? <><Check size={14}/> Applied</> : "Apply action"}</button>
      </article>) : <div className="no-recommendations"><Check size={15}/> No single action strictly improves on doing nothing.</div>}
      <article className={`action-card baseline-card ${!activeAction ? "applied" : ""}`}><div className="action-rank">BASELINE</div><h3>Do nothing</h3><div className="action-score">Score <strong>{baseline.score}</strong><span>Reference outcome</span></div><button className="apply-action quiet-action" onClick={() => onApply(null)} disabled={!activeAction}>{!activeAction ? <><Check size={14}/> Current outcome</> : "Restore baseline"}</button></article>
    </div>
    <div className="before-after">
      <div className="before-after-head"><div><strong>Before / after</strong><small>{activeAction ? "Single recovery action applied" : "No action applied"}</small></div>{activeAction && <button className="undo-button" onClick={onUndo}><RotateCcw size={13}/> Undo</button>}</div>
      <div className="delta-table"><span>Metric</span><span>Before</span><span>After</span><span>Change</span>
        {([ ["Delay minutes", baseline.totalDepDelayMinutes, afterMetrics.totalDepDelayMinutes], ["Stranded pax", baseline.strandedPax, afterMetrics.strandedPax], ["Crew breaches", baseline.crewBreaches, afterMetrics.crewBreaches], ["Cancellations", baseline.cancelledFlights, afterMetrics.cancelledFlights] ] as Array<[string, number, number]>).map(([label, before, after]) => <div className="delta-row" key={label}><strong>{label}</strong><span>{before}</span><span>{after}</span><b className={after < before ? "delta-good" : after > before ? "delta-bad" : ""}>{after - before === 0 ? "—" : `${after - before > 0 ? "+" : ""}${after - before}`}</b></div>)}
      </div>
    </div>
    <form className="dispatcher-chat" onSubmit={submitQuestion}><label htmlFor="dispatcher-question">Ask about this simulation</label><div className="chat-input-wrap"><input id="dispatcher-question" value={question} onChange={event => setQuestion(event.target.value)} onKeyDown={event => { if (event.key === "Enter" && (event.nativeEvent.isComposing || event.keyCode === 229)) event.preventDefault() }} placeholder="Why is DS0204 late?" maxLength={300}/><button aria-label="Send question" disabled={!question.trim() || chatPending}>{chatPending ? <LoaderCircle size={15} className="spin"/> : <CornerDownLeft size={15}/>}</button></div>{answer && <p className="chat-answer" role="status">{answer} <span>· {answerVerified ? "verified against engine" : "not verified"}</span></p>}</form>
  </section>
}
