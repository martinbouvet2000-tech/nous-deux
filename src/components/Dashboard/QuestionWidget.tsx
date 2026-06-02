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
    <div className="relative overflow-hidden rounded-2xl p-5 md:p-6 bg-[#1E1B17] transition-all duration-500 ease-out hover:bg-[#252118] hover:shadow-[0_8px_48px_rgba(0,0,0,0.3),0_0_0_1px_rgba(212,165,116,0.04)] group">
      {/* Top edge glow */}
      <div className="absolute top-0 left-[15%] right-[15%] h-px bg-gradient-to-r from-transparent via-[rgba(212,165,116,0.12)] to-transparent opacity-60 group-hover:opacity-100 group-hover:via-[rgba(212,165,116,0.2)] transition-opacity duration-500 ease-out" />

      <div className="flex items-center gap-2.5 mb-5">
        <div className="w-7 h-7 rounded-lg bg-[rgba(212,165,116,0.12)] flex items-center justify-center">
          <MessageCircle size={15} className="text-[#D4A574]" />
        </div>
        <h3 className="text-sm font-medium tracking-wide uppercase text-[#9B9287]">Question du jour</h3>
        <Sparkles size={12} className="text-[#E8B86D] ml-auto opacity-60" />
      </div>

      {/* Question text — intimate conversation starter */}
      <div className="text-center mb-6 px-2">
        <p className="text-lg md:text-xl font-light leading-relaxed tracking-tight text-[#F0EAE0]/90 italic">
          {question.question}
        </p>
        <div className="w-12 h-px bg-gradient-to-r from-transparent via-[rgba(212,165,116,0.2)] to-transparent mx-auto mt-4" />
      </div>

      {savedMyAnswer ? (
        <div className="space-y-3 animate-fade-in">
          {/* My answer */}
          <div className="rounded-xl p-4 bg-[rgba(255,255,255,0.03)]">
            <p className="text-[11px] text-[#E8C9A0] mb-1.5 font-medium uppercase tracking-wider">Ta reponse</p>
            <p className="text-sm leading-relaxed text-[#F0EAE0]/80">{savedMyAnswer}</p>
          </div>

          {/* Partner answer */}
          {partnerAnswer ? (
            <div className="rounded-xl p-4 bg-[rgba(255,255,255,0.03)] animate-slide-up">
              <p className="text-[11px] text-[#D99AAD] mb-1.5 font-medium uppercase tracking-wider">
                {partnerProfile?.display_name}
              </p>
              <p className="text-sm leading-relaxed text-[#F0EAE0]/80">{partnerAnswer}</p>
            </div>
          ) : (
            <div className="flex items-center justify-center gap-2 text-[#9B9287] text-sm py-4 rounded-xl bg-[rgba(255,255,255,0.02)]">
              <Lock size={14} className="text-[#6B6359]" />
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
            placeholder="Ecris ta reponse..."
            className="w-full bg-[rgba(255,255,255,0.03)] rounded-xl px-4 py-3 text-sm text-[#F0EAE0] placeholder-[#6B6359] outline-none transition-all duration-300 ease-out focus:bg-[rgba(255,255,255,0.05)] focus:shadow-[0_0_0_2px_rgba(212,165,116,0.15),0_0_0_1px_rgba(212,165,116,0.08)] flex-1"
            onKeyDown={(e) => e.key === 'Enter' && submitAnswer()}
          />
          <button
            onClick={submitAnswer}
            disabled={submitting || !myAnswer.trim()}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium bg-gradient-to-r from-[#D4A574] to-[#C2788E] text-[#110F0E] shadow-[0_2px_20px_rgba(212,165,116,0.2)] hover:shadow-[0_4px_28px_rgba(212,165,116,0.35)] hover:translate-y-[-1px] active:translate-y-0 active:scale-[0.98] transition-all duration-300 ease-out disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Send size={16} />
          </button>
        </div>
      )}
    </div>
  )
}
