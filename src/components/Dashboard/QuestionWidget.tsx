import { useState, useEffect } from 'react'
import { MessageCircle, Send, Lock, Sparkles } from 'lucide-react'
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
      <div className="flex items-center gap-2 mb-4">
        <div className="w-7 h-7 rounded-lg bg-primary/15 flex items-center justify-center">
          <MessageCircle size={15} className="text-primary" />
        </div>
        <h3 className="text-sm font-semibold">Question du jour</h3>
        <Sparkles size={12} className="text-accent ml-auto" />
      </div>

      {/* Question text */}
      <div className="text-center mb-5 px-4">
        <p className="text-lg md:text-xl font-medium leading-relaxed">{question.question}</p>
      </div>

      {savedMyAnswer ? (
        <div className="space-y-3 animate-fade-in">
          {/* My answer */}
          <div className="rounded-xl p-4 bg-white/[0.04]">
            <p className="text-[11px] text-primary-light mb-1.5 font-semibold uppercase tracking-wider">Ta réponse</p>
            <p className="text-sm leading-relaxed">{savedMyAnswer}</p>
          </div>

          {/* Partner answer */}
          {partnerAnswer ? (
            <div className="rounded-xl p-4 bg-white/[0.04] animate-slide-up">
              <p className="text-[11px] text-secondary-light mb-1.5 font-semibold uppercase tracking-wider">
                {partnerProfile?.display_name}
              </p>
              <p className="text-sm leading-relaxed">{partnerAnswer}</p>
            </div>
          ) : (
            <div className="flex items-center justify-center gap-2 text-text-muted text-sm py-4 rounded-xl bg-white/[0.03]">
              <Lock size={14} />
              <span>En attente de {partnerProfile?.display_name ?? 'ton/ta partenaire'}</span>
            </div>
          )}
        </div>
      ) : (
        <div className="flex gap-2">
          <input
            type="text"
            value={myAnswer}
            onChange={(e) => setMyAnswer(e.target.value)}
            placeholder="Écris ta réponse…"
            className="input flex-1"
            onKeyDown={(e) => e.key === 'Enter' && submitAnswer()}
          />
          <button
            onClick={submitAnswer}
            disabled={submitting || !myAnswer.trim()}
            className="btn btn-primary px-4"
          >
            <Send size={16} />
          </button>
        </div>
      )}
    </div>
  )
}
