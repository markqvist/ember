'use client';

import { useState, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { Check, RotateCcw, Plus, Trash2, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useI18n } from '@/lib/hooks/use-i18n';
import type { QuizContent, QuizQuestion, QuizOption } from '@/lib/types/stage';

type QuestionType = QuizQuestion['type'];

interface QuizEditorProps {
  content: QuizContent;
  onSave: (updatedContent: QuizContent) => void;
  onRevert: () => void;
}

const QUESTION_TYPES: { value: QuestionType; label: string }[] = [
  { value: 'single', label: 'Single Choice' },
  { value: 'multiple', label: 'Multiple Choice' },
  { value: 'short_answer', label: 'Short Answer' },
];

const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  single: 'Single Choice',
  multiple: 'Multiple Choice',
  short_answer: 'Short Answer',
};

function generateQuestionId(index: number): string {
  return `q${index + 1}`;
}

function generateOptionValue(index: number): string {
  return String.fromCharCode(65 + index); // A, B, C, D...
}

function createDefaultOptions(): QuizOption[] {
  return [
    { value: 'A', label: '' },
    { value: 'B', label: '' },
    { value: 'C', label: '' },
    { value: 'D', label: '' },
  ];
}

function createEmptyQuestion(index: number): QuizQuestion {
  return {
    id: generateQuestionId(index),
    type: 'single',
    question: '',
    options: createDefaultOptions(),
    answer: [],
    analysis: '',
    points: 10,
    hasAnswer: true,
  };
}

interface QuestionCardProps {
  question: QuizQuestion;
  index: number;
  onChange: (updated: QuizQuestion) => void;
  onRemove: () => void;
  isExpanded: boolean;
  onToggle: () => void;
}

function QuestionCard({ question, index, onChange, onRemove, isExpanded, onToggle }: QuestionCardProps) {
  const { t } = useI18n();

  const handleTypeChange = (type: QuestionType) => {
    const updates: Partial<QuizQuestion> = { type };
    
    if (type === 'short_answer') {
      // Remove options for short answer
      updates.options = undefined;
      updates.answer = undefined;
      updates.hasAnswer = false;
    } else {
      // Add default options for choice types
      updates.options = question.options || createDefaultOptions();
      updates.hasAnswer = true;
      // Reset answer if switching from multiple to single
      if (type === 'single' && question.answer && question.answer.length > 1) {
        updates.answer = question.answer.slice(0, 1);
      }
    }
    
    onChange({ ...question, ...updates });
  };

  const handleOptionChange = (optIndex: number, field: keyof QuizOption, value: string) => {
    if (!question.options) return;
    const newOptions = [...question.options];
    newOptions[optIndex] = { ...newOptions[optIndex], [field]: value };
    onChange({ ...question, options: newOptions });
  };

  const handleAddOption = () => {
    if (!question.options) return;
    const newIndex = question.options.length;
    const newOption: QuizOption = {
      value: generateOptionValue(newIndex),
      label: '',
    };
    onChange({ ...question, options: [...question.options, newOption] });
  };

  const handleRemoveOption = (optIndex: number) => {
    if (!question.options || question.options.length <= 2) return;
    const newOptions = question.options.filter((_, i) => i !== optIndex);
    // Re-index remaining options
    const reindexedOptions = newOptions.map((opt, i) => ({
      ...opt,
      value: generateOptionValue(i),
    }));
    // Update answer to remove deleted option and remap remaining
    const removedValue = question.options[optIndex].value;
    const newAnswer = (question.answer || [])
      .filter((v) => v !== removedValue)
      .map((v) => {
        const oldIndex = question.options!.findIndex((o) => o.value === v);
        return oldIndex > optIndex ? generateOptionValue(oldIndex - 1) : v;
      });
    onChange({ ...question, options: reindexedOptions, answer: newAnswer });
  };

  const toggleAnswer = (value: string) => {
    const currentAnswer = question.answer || [];
    if (question.type === 'single') {
      onChange({ ...question, answer: [value] });
    } else {
      const newAnswer = currentAnswer.includes(value)
        ? currentAnswer.filter((v) => v !== value)
        : [...currentAnswer, value];
      onChange({ ...question, answer: newAnswer });
    }
  };

  return (
    <div className="border rounded-lg overflow-hidden bg-card">
      {/* Header */}
      <div
        className="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-muted/50 transition-colors"
        onClick={onToggle}
      >
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="text-xs font-mono text-muted-foreground w-6 shrink-0">{index + 1}</span>
          <span
            className={cn(
              'text-xs font-medium px-1.5 py-0.5 rounded shrink-0',
              question.type === 'single' && 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
              question.type === 'multiple' && 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
              question.type === 'short_answer' && 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
            )}
          >
            {QUESTION_TYPE_LABELS[question.type]}
          </span>
          <span className="text-xs text-muted-foreground truncate">
            {question.question.slice(0, 60) || 'Untitled Question'}
            {question.question.length > 60 ? '...' : ''}
          </span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <span className="text-xs text-muted-foreground mr-2">{question.points || 1} pts</span>
          {isExpanded ? (
            <ChevronUp className="w-4 h-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 ml-1"
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
          >
            <Trash2 className="w-3.5 h-3.5 text-destructive" />
          </Button>
        </div>
      </div>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="px-3 pb-3 pt-1 border-t space-y-3">
          {/* Question Type */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">{t('stage.questionType')}</label>
            <div className="flex gap-2">
              {QUESTION_TYPES.map((qt) => (
                <Button
                  key={qt.value}
                  type="button"
                  variant={question.type === qt.value ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => handleTypeChange(qt.value)}
                  className="text-xs h-7"
                >
                  {qt.label}
                </Button>
              ))}
            </div>
          </div>

          {/* Question Text */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">{t('stage.questionText')}</label>
            <Textarea
              value={question.question}
              onChange={(e) => onChange({ ...question, question: e.target.value })}
              placeholder="Enter your question..."
              className="w-full min-h-[60px] text-xs resize-none"
            />
          </div>

          {/* Points */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">{t('stage.points')}</label>
            <Input
              type="number"
              min={1}
              max={100}
              value={question.points || 1}
              onChange={(e) => onChange({ ...question, points: parseInt(e.target.value) || 1 })}
              className="w-24 text-xs"
            />
          </div>

          {/* Options (for choice types) */}
          {question.type !== 'short_answer' && question.options && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-foreground">{t('stage.options')}</label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleAddOption}
                  className="h-6 text-xs"
                >
                  <Plus className="w-3 h-3 mr-1" />
                  Add
                </Button>
              </div>
              <div className="space-y-1.5">
                {question.options.map((option, optIndex) => (
                  <div key={option.value} className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => toggleAnswer(option.value)}
                      className={cn(
                        'w-6 h-6 rounded flex items-center justify-center text-xs font-bold transition-colors',
                        question.answer?.includes(option.value)
                          ? 'bg-emerald-500 text-white'
                          : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
                      )}
                      title={t('stage.correctAnswer')}
                    >
                      {option.value}
                    </button>
                    <Input
                      value={option.label}
                      onChange={(e) => handleOptionChange(optIndex, 'label', e.target.value)}
                      placeholder={`Option ${option.value}`}
                      className="flex-1 text-xs h-8"
                    />
                    {question.options!.length > 2 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => handleRemoveOption(optIndex)}
                        className="h-7 w-7"
                      >
                        <Trash2 className="w-3 h-3 text-destructive" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Click the letter button to mark as correct answer
              </p>
            </div>
          )}

          {/* Analysis */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">{t('stage.analysis')}</label>
            <Textarea
              value={question.analysis || ''}
              onChange={(e) => onChange({ ...question, analysis: e.target.value })}
              placeholder="Explanation shown after answering..."
              className="w-full min-h-[60px] text-xs resize-none"
            />
          </div>

          {/* Comment Prompt (for short answer) */}
          {question.type === 'short_answer' && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">{t('stage.commentPrompt')}</label>
              <Textarea
                value={question.commentPrompt || ''}
                onChange={(e) => onChange({ ...question, commentPrompt: e.target.value })}
                placeholder="Instructions for AI grading..."
                className="w-full min-h-[60px] text-xs resize-none"
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function QuizEditor({ content, onSave, onRevert }: QuizEditorProps) {
  const { t } = useI18n();
  const [questions, setQuestions] = useState<QuizQuestion[]>(content.questions);
  const [expandedIndex, setExpandedIndex] = useState<number | null>(0);
  const [hasChanges, setHasChanges] = useState(false);

  const originalQuestions = content.questions;

  const handleQuestionChange = useCallback((index: number, updated: QuizQuestion) => {
    setQuestions((prev) => {
      const next = [...prev];
      next[index] = updated;
      return next;
    });
    setHasChanges(true);
  }, []);

  const handleQuestionRemove = useCallback((index: number) => {
    setQuestions((prev) => {
      const filtered = prev.filter((_, i) => i !== index);
      // Re-index question IDs
      return filtered.map((q, i) => ({ ...q, id: generateQuestionId(i) }));
    });
    setHasChanges(true);
    if (expandedIndex === index) setExpandedIndex(null);
    else if (expandedIndex !== null && expandedIndex > index) {
      setExpandedIndex(expandedIndex - 1);
    }
  }, [expandedIndex]);

  const handleAddQuestion = useCallback((type: QuestionType = 'single') => {
    const newQuestion: QuizQuestion = {
      ...createEmptyQuestion(questions.length),
      type,
    };
    if (type === 'short_answer') {
      newQuestion.options = undefined;
      newQuestion.answer = undefined;
      newQuestion.hasAnswer = false;
    }
    setQuestions((prev) => [...prev, newQuestion]);
    setHasChanges(true);
    setExpandedIndex(questions.length);
  }, [questions.length]);

  const handleSave = useCallback(() => {
    onSave({
      type: 'quiz',
      questions,
    });
  }, [questions, onSave]);

  const handleRevert = useCallback(() => {
    setQuestions(originalQuestions);
    setHasChanges(false);
    setExpandedIndex(0);
    onRevert();
  }, [originalQuestions, onRevert]);

  const totalPoints = questions.reduce((sum, q) => sum + (q.points || 1), 0);

  return (
    <div className="flex flex-col gap-3 h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {t('stage.editingQuiz')} ({questions.length} questions, {totalPoints} pts)
          </span>
        </div>
        <div className="flex items-center gap-2">
          {hasChanges && (
            <span className="text-xs text-amber-600 dark:text-amber-400">{t('stage.modified')}</span>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={handleRevert}
            disabled={!hasChanges}
            className="h-7 px-2 text-xs"
          >
            <RotateCcw className="w-3 h-3 mr-1" />
            {t('stage.revert')}
          </Button>
          <Button
            variant="default"
            size="sm"
            onClick={handleSave}
            disabled={!hasChanges}
            className="h-7 px-2 text-xs"
          >
            <Check className="w-3 h-3 mr-1" />
            {t('stage.applyChanges')}
          </Button>
        </div>
      </div>

      {/* Questions List */}
      <div className="flex-1 overflow-y-auto space-y-2 pr-1">
        {questions.map((question, index) => (
          <QuestionCard
            key={question.id}
            question={question}
            index={index}
            onChange={(updated) => handleQuestionChange(index, updated)}
            onRemove={() => handleQuestionRemove(index)}
            isExpanded={expandedIndex === index}
            onToggle={() => setExpandedIndex(expandedIndex === index ? null : index)}
          />
        ))}
      </div>

      {/* Add Question Buttons */}
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => handleAddQuestion('single')}
          className="flex-1 text-xs"
        >
          <Plus className="w-3.5 h-3.5 mr-1" />
          Single Choice
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => handleAddQuestion('multiple')}
          className="flex-1 text-xs"
        >
          <Plus className="w-3.5 h-3.5 mr-1" />
          Multiple Choice
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => handleAddQuestion('short_answer')}
          className="flex-1 text-xs"
        >
          <Plus className="w-3.5 h-3.5 mr-1" />
          Short Answer
        </Button>
      </div>
    </div>
  );
}
