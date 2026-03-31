'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Plus, Trash2, ChevronUp, ChevronDown } from 'lucide-react';
import { nanoid } from 'nanoid';
import type { SceneOutline } from '@/lib/types/generation';
import { useI18n } from '@/lib/hooks/use-i18n';

interface OutlinesEditorProps {
  outlines: SceneOutline[];
  onChange: (outlines: SceneOutline[]) => void;
  onConfirm: () => void;
  onBack: () => void;
  isLoading?: boolean;
}

export function OutlinesEditor({
  outlines,
  onChange,
  onConfirm,
  onBack,
  isLoading = false,
}: OutlinesEditorProps) {
  const { t } = useI18n();
  const addOutline = () => {
    const newOutline: SceneOutline = {
      id: nanoid(8),
      type: 'slide',
      title: '',
      description: '',
      keyPoints: [],
      order: outlines.length + 1,
    };
    onChange([...outlines, newOutline]);
  };

  const updateOutline = (index: number, updates: Partial<SceneOutline>) => {
    const newOutlines = [...outlines];
    newOutlines[index] = { ...newOutlines[index], ...updates };
    onChange(newOutlines);
  };

  const removeOutline = (index: number) => {
    const newOutlines = outlines.filter((_, i) => i !== index);
    // Update order
    newOutlines.forEach((outline, i) => {
      outline.order = i + 1;
    });
    onChange(newOutlines);
  };

  const moveOutline = (index: number, direction: 'up' | 'down') => {
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= outlines.length) return;
    const newOutlines = [...outlines];
    [newOutlines[index], newOutlines[newIndex]] = [newOutlines[newIndex], newOutlines[index]];
    // Update order
    newOutlines.forEach((outline, i) => {
      outline.order = i + 1;
    });
    onChange(newOutlines);
  };

  const updateKeyPoints = (index: number, keyPointsText: string) => {
    const keyPoints = keyPointsText
      .split('\n')
      .map((p) => p.trim())
      .filter(Boolean);
    updateOutline(index, { keyPoints });
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-lg font-semibold">{t('generation.outlineEditorTitle')}</h2>
          <p className="text-sm text-muted-foreground">
            {t('generation.outlineEditorSummary').replace('{count}', String(outlines.length))}
          </p>
        </div>
        <Button variant="outline" onClick={addOutline} disabled={isLoading}>
          <Plus className="size-4 mr-1" />
          {t('generation.addScene')}
        </Button>
      </div>

      <div className="space-y-4">
        {outlines.map((outline, index) => (
          <Card key={outline.id} className="relative">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-3">
                <div className="flex flex-col gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => moveOutline(index, 'up')}
                    disabled={index === 0 || isLoading}
                    className="size-6"
                  >
                    <ChevronUp className="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => moveOutline(index, 'down')}
                    disabled={index === outlines.length - 1 || isLoading}
                    className="size-6"
                  >
                    <ChevronDown className="size-4" />
                  </Button>
                </div>
                <div className="flex-1">
                  <CardTitle className="text-base flex items-center gap-2">
                    <span className="bg-primary text-primary-foreground size-6 rounded-full flex items-center justify-center text-sm">
                      {index + 1}
                    </span>
                    <Input
                      value={outline.title}
                      onChange={(e) => updateOutline(index, { title: e.target.value })}
                      placeholder={t('generation.sceneTitlePlaceholder')}
                      className="flex-1"
                      disabled={isLoading}
                    />
                  </CardTitle>
                </div>
                <Select
                  value={outline.type}
                  onValueChange={(value) =>
                    updateOutline(index, {
                      type: value as SceneOutline['type'],
                    })
                  }
                  disabled={isLoading}
                >
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="slide">{t('generation.sceneTypeSlide')}</SelectItem>
                    <SelectItem value="quiz">{t('generation.sceneTypeQuiz')}</SelectItem>
                    <SelectItem value="interactive">{t('generation.sceneTypeInteractive')}</SelectItem>
                    <SelectItem value="pbl">{t('generation.sceneTypePbl')}</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => removeOutline(index)}
                  disabled={isLoading}
                >
                  <Trash2 className="size-4 text-destructive" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>{t('generation.sceneDescriptionLabel')}</Label>
                <Textarea
                  value={outline.description}
                  onChange={(e) => updateOutline(index, { description: e.target.value })}
                  placeholder={t('generation.sceneDescriptionPlaceholder')}
                  rows={2}
                  disabled={isLoading}
                />
              </div>

              <div className="space-y-2">
                <Label>{t('generation.keyPointsLabel')}</Label>
                <Textarea
                  value={outline.keyPoints?.join('\n') || ''}
                  onChange={(e) => updateKeyPoints(index, e.target.value)}
                  placeholder={t('generation.keyPointsPlaceholder')}
                  rows={3}
                  disabled={isLoading}
                />
              </div>

              {outline.type === 'quiz' && (
                <div className="p-3 bg-muted/50 rounded-lg space-y-3">
                  <Label className="text-sm font-medium">{t('generation.quizConfigLabel')}</Label>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">{t('generation.quizQuestionCount')}</Label>
                      <Input
                        type="number"
                        value={outline.quizConfig?.questionCount || 3}
                        onChange={(e) =>
                          updateOutline(index, {
                            quizConfig: {
                              ...outline.quizConfig,
                              questionCount: parseInt(e.target.value) || 3,
                              difficulty: outline.quizConfig?.difficulty || 'medium',
                              questionTypes: outline.quizConfig?.questionTypes || ['single'],
                            },
                          })
                        }
                        min={1}
                        max={10}
                        disabled={isLoading}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">{t('generation.quizDifficulty')}</Label>
                      <Select
                        value={outline.quizConfig?.difficulty || 'medium'}
                        onValueChange={(value) =>
                          updateOutline(index, {
                            quizConfig: {
                              ...outline.quizConfig,
                              difficulty: value as 'easy' | 'medium' | 'hard',
                              questionCount: outline.quizConfig?.questionCount || 3,
                              questionTypes: outline.quizConfig?.questionTypes || ['single'],
                            },
                          })
                        }
                        disabled={isLoading}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="easy">{t('generation.quizDifficultyEasy')}</SelectItem>
                          <SelectItem value="medium">
                            {t('generation.quizDifficultyMedium')}
                          </SelectItem>
                          <SelectItem value="hard">{t('generation.quizDifficultyHard')}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">{t('generation.quizType')}</Label>
                      <Select
                        value={outline.quizConfig?.questionTypes?.[0] || 'single'}
                        onValueChange={(value) =>
                          updateOutline(index, {
                            quizConfig: {
                              ...outline.quizConfig,
                              questionTypes: [value as 'single' | 'multiple' | 'text'],
                              questionCount: outline.quizConfig?.questionCount || 3,
                              difficulty: outline.quizConfig?.difficulty || 'medium',
                            },
                          })
                        }
                        disabled={isLoading}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="single">{t('generation.quizTypeSingle')}</SelectItem>
                          <SelectItem value="multiple">
                            {t('generation.quizTypeMultiple')}
                          </SelectItem>
                          <SelectItem value="text">{t('generation.quizTypeText')}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              )}

              {outline.type === 'interactive' && (
                <div className="p-3 bg-muted/50 rounded-lg space-y-3">
                  <Label className="text-sm font-medium">{t('generation.interactiveConfigLabel')}</Label>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">{t('generation.interactiveConceptName')}</Label>
                      <Input
                        value={outline.interactiveConfig?.conceptName || ''}
                        onChange={(e) =>
                          updateOutline(index, {
                            interactiveConfig: {
                              ...outline.interactiveConfig,
                              conceptName: e.target.value,
                              conceptOverview: outline.interactiveConfig?.conceptOverview || '',
                              designIdea: outline.interactiveConfig?.designIdea || '',
                            },
                          })
                        }
                        placeholder={t('generation.interactiveConceptNamePlaceholder')}
                        disabled={isLoading}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">{t('generation.interactiveSubject')}</Label>
                      <Input
                        value={outline.interactiveConfig?.subject || ''}
                        onChange={(e) =>
                          updateOutline(index, {
                            interactiveConfig: {
                              ...outline.interactiveConfig,
                              subject: e.target.value,
                              conceptName: outline.interactiveConfig?.conceptName || '',
                              conceptOverview: outline.interactiveConfig?.conceptOverview || '',
                              designIdea: outline.interactiveConfig?.designIdea || '',
                            },
                          })
                        }
                        placeholder={t('generation.interactiveSubjectPlaceholder')}
                        disabled={isLoading}
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">{t('generation.interactiveConceptOverview')}</Label>
                    <Textarea
                      value={outline.interactiveConfig?.conceptOverview || ''}
                      onChange={(e) =>
                        updateOutline(index, {
                          interactiveConfig: {
                            ...outline.interactiveConfig,
                            conceptOverview: e.target.value,
                            conceptName: outline.interactiveConfig?.conceptName || '',
                            designIdea: outline.interactiveConfig?.designIdea || '',
                          },
                        })
                      }
                      placeholder={t('generation.interactiveConceptOverviewPlaceholder')}
                      rows={2}
                      disabled={isLoading}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">{t('generation.interactiveDesignIdea')}</Label>
                    <Textarea
                      value={outline.interactiveConfig?.designIdea || ''}
                      onChange={(e) =>
                        updateOutline(index, {
                          interactiveConfig: {
                            ...outline.interactiveConfig,
                            designIdea: e.target.value,
                            conceptName: outline.interactiveConfig?.conceptName || '',
                            conceptOverview: outline.interactiveConfig?.conceptOverview || '',
                          },
                        })
                      }
                      placeholder={t('generation.interactiveDesignIdeaPlaceholder')}
                      rows={3}
                      disabled={isLoading}
                    />
                  </div>
                </div>
              )}

              {outline.type === 'pbl' && (
                <div className="p-3 bg-muted/50 rounded-lg space-y-3">
                  <Label className="text-sm font-medium">{t('generation.pblConfigLabel')}</Label>
                  <div className="space-y-1">
                    <Label className="text-xs">{t('generation.pblProjectTopic')}</Label>
                    <Input
                      value={outline.pblConfig?.projectTopic || ''}
                      onChange={(e) =>
                        updateOutline(index, {
                          pblConfig: {
                            ...outline.pblConfig,
                            projectTopic: e.target.value,
                            projectDescription: outline.pblConfig?.projectDescription || '',
                            targetSkills: outline.pblConfig?.targetSkills || [],
                            issueCount: outline.pblConfig?.issueCount || 3,
                            language: outline.pblConfig?.language || 'en-US',
                          },
                        })
                      }
                      placeholder={t('generation.pblProjectTopicPlaceholder')}
                      disabled={isLoading}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">{t('generation.pblProjectDescription')}</Label>
                    <Textarea
                      value={outline.pblConfig?.projectDescription || ''}
                      onChange={(e) =>
                        updateOutline(index, {
                          pblConfig: {
                            ...outline.pblConfig,
                            projectDescription: e.target.value,
                            projectTopic: outline.pblConfig?.projectTopic || '',
                            targetSkills: outline.pblConfig?.targetSkills || [],
                            issueCount: outline.pblConfig?.issueCount || 3,
                            language: outline.pblConfig?.language || 'en-US',
                          },
                        })
                      }
                      placeholder={t('generation.pblProjectDescriptionPlaceholder')}
                      rows={2}
                      disabled={isLoading}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">{t('generation.pblIssueCount')}</Label>
                      <Input
                        type="number"
                        value={outline.pblConfig?.issueCount || 3}
                        onChange={(e) =>
                          updateOutline(index, {
                            pblConfig: {
                              ...outline.pblConfig,
                              issueCount: parseInt(e.target.value) || 3,
                              projectTopic: outline.pblConfig?.projectTopic || '',
                              projectDescription: outline.pblConfig?.projectDescription || '',
                              targetSkills: outline.pblConfig?.targetSkills || [],
                              language: outline.pblConfig?.language || 'en-US',
                            },
                          })
                        }
                        min={1}
                        max={10}
                        disabled={isLoading}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">{t('generation.pblTargetSkills')}</Label>
                      <Textarea
                        value={outline.pblConfig?.targetSkills?.join('\n') || ''}
                        onChange={(e) =>
                          updateOutline(index, {
                            pblConfig: {
                              ...outline.pblConfig,
                              targetSkills: e.target.value
                                .split('\n')
                                .map((s) => s.trim())
                                .filter(Boolean),
                              projectTopic: outline.pblConfig?.projectTopic || '',
                              projectDescription: outline.pblConfig?.projectDescription || '',
                              issueCount: outline.pblConfig?.issueCount || 3,
                              language: outline.pblConfig?.language || 'en-US',
                            },
                          })
                        }
                        placeholder={t('generation.pblTargetSkillsPlaceholder')}
                        rows={2}
                        disabled={isLoading}
                      />
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {outlines.length === 0 && (
        <Card className="p-8 text-center">
          <p className="text-muted-foreground mb-4">{t('generation.noOutlines')}</p>
          <Button variant="outline" onClick={addOutline} disabled={isLoading}>
            <Plus className="size-4 mr-1" />
            {t('generation.addFirstScene')}
          </Button>
        </Card>
      )}

      {/* Actions */}
      <div className="flex justify-between pt-4">
        <Button variant="outline" onClick={onBack} disabled={isLoading}>
          {t('generation.backToRequirements')}
        </Button>
        <Button onClick={onConfirm} disabled={isLoading || outlines.length === 0}>
          {isLoading
            ? t('generation.generatingInProgress')
            : t('generation.confirmAndGenerateCourse')}
        </Button>
      </div>
    </div>
  );
}
