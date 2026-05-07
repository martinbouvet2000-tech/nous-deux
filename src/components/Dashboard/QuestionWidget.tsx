import { useState, useEffect } from 'react'
import { HelpCircle, Send, Lock } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'

export default function QuestionWidget() {
  const { profile, partnerProfile } = useAuthStore()
  const [question, setQuestion] = useState<{ id: string; question: string } | null>(null)
  const [myAnswer, setMyAnswer] = useState('')
  const [savedMyAnswer, setSavedMyAnswer] = useState<string | null>(null)
  const [partnerAnswer, setPartnerAnswer] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!profile) return
    loadTodayQuestion()
  }, [profile])

  const loadTodayQuestion = async () => {
    if (!profile) return
    const today = new Date().toISOString().split('T')[0]

    let { data: q } = await supabase
      .from('daily_questions')
      .select('*')
      .eq('date', today)
      .limit(1)
      .single()

    if (!q) {
      const { data: randomQ } = await supabase
        .from('question_bank')
        .select('*')
        .limit(1)
        .single()

      if (randomQ) {
        const { data: newQ } = await supabase
          .from('daily_questions')
          .insert({ question: randomQ.question, category: randomQ.category, date: today })
          .select()
          .single()
        q = newQ
      }
    }

    if (q) {
      setQuestion(q)

      const { data: answers } = await supabase
        .from('question_answers')
        .select('*')
        .eq('question_id', q.id)

      const mine = answers?.find((a) => a.user_id === profile.id)
      const theirs = answers?.find((a) => a.user_id === partnerProfile?.id)

      if (mine) setSavedMyAnswer(mine.answer)
      if (theirs && mine) setPartnerAnswer(theirs.answer)
    }
  }

  const submitAnswer = async () => {
    if (!profile || !question || !myAnswer.trim()) return
    setSubmitting(true)

    await supabase.from('question_answers').insert({
      question_id: question.id,
      user_id: profile.id,
      answer: myAnswer.trim(),
    })

    setSavedMyAnswer(myAnswer.trim())
    setMyAnswer('')
    setSubmitting(false)
    loadTodayQuestion()
  }

  if (!question) return null

  return (
    <div className="card">
      <div className="flex items-center gap-2 mb-3">
        <HelpCircle size={16} className="text-primary" />
        <h3 className="text-sm font-semibold">Question du jour</h3>
      </div>

      <p className="text-center text-lg mb-4">{question.question}</p>

      {savedMyAnswer ? (
        <div className="space-y-3">
          <div className="bg-primary/10 rounded-lg p-3">
            <p className="text-xs text-text-muted mb-1">Ta réponse</p>
            <p className="text-sm">{savedMyAnswer}</p>
          </div>

          {partnerAnswer ? (
            <div className="bg-secondary/10 rounded-lg p-3">
              <p className="text-xs text-text-muted mb-1">{partnerProfile?.display_name}</p>
              <p className="text-sm">{partnerAnswer}</p>
            </div>
          ) : (
            <div className="flex items-center justify-center gap-2 text-text-muted text-sm py-2">
              <Lock size={14} />
              <span>En attente de la réponse de {partnerProfile?.display_name ?? 'ton/ta partenaire'}</span>
            </div>
          )}
        </div>
      ) : (
        <div className="flex gap-2">
          <input
            type="text"
            value={myAnswer}
            onChange={(e) => setMyAnswer(e.target.value)}
            placeholder="Ta réponse..."
            className="flex-1 bg-surface-lighter rounded-lg px-3 py-2 text-sm text-text focus:outline-none focus:ring-1 focus:ring-primary"
            onKeyDown={(e) => e.key === 'Enter' && submitAnswer()}
          />
          <button onClick={submitAnswer} disabled={submitting || !myAnswer.trim()} className="btn btn-primary px-3">
            <Send size={16} />
          </button>
        </div>
      )}
    </div>
  )
}
