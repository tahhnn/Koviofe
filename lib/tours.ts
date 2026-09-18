import { TourOptions } from '@/hooks/use-step-tour'

/**
 * A tour is copy, so it cannot be a module-level constant: the text has to come
 * from the catalog of whoever is reading it, and this module has no place to
 * call a hook. Each tour is therefore a function of a translator — call it from
 * the component, which already has one:
 *
 *     const tTour = useTranslations('tours')
 *     <TourButton tour={dashboardTour(tTour)} … />
 */
export type TourTranslator = (key: string) => string

/** Everything outside the steps is identical for every tour. */
const chrome = (t: TourTranslator) => ({
  overlayColor: 'rgba(0, 0, 0, 0.75)',
  highlightPadding: 12,
  showSkipButton: true,
  showProgress: true,
  scrollBehavior: 'smooth' as const,
  animation: true,
  finishLabel: t('finish'),
  nextLabel: t('next'),
  prevLabel: t('back'),
  skipLabel: t('skip'),
})

export const dashboardTour = (t: TourTranslator): TourOptions => ({
  steps: [
    {
      element: '[data-tour="dashboard-header"]',
      title: t('dashboardWelcomeTitle'),
      content: t('dashboardWelcomeBody'),
      position: 'bottom',
    },
    {
      element: '[data-tour="create-quiz-btn"]',
      title: t('dashboardCreateTitle'),
      content: t('dashboardCreateBody'),
      position: 'left',
    },
    {
      element: '[data-tour="stats-grid"]',
      title: t('dashboardStatsTitle'),
      content: t('dashboardStatsBody'),
      position: 'top',
    },
    {
      element: '[data-tour="quiz-tabs"]',
      title: t('dashboardTabsTitle'),
      content: t('dashboardTabsBody'),
      position: 'bottom',
    },
    {
      element: '[data-tour="quiz-list"]',
      title: t('dashboardListTitle'),
      content: t('dashboardListBody'),
      position: 'top',
    },
  ],
  ...chrome(t),
})

export const quizEditorTour = (t: TourTranslator): TourOptions => ({
  steps: [
    {
      element: '[data-tour="quiz-editor-header"]',
      title: t('editorHeaderTitle'),
      content: t('editorHeaderBody'),
      position: 'bottom',
    },
    {
      element: '[data-tour="question-slides"]',
      title: t('editorSlidesTitle'),
      content: t('editorSlidesBody'),
      position: 'right',
    },
    {
      element: '[data-tour="question-editor"]',
      title: t('editorQuestionTitle'),
      content: t('editorQuestionBody'),
      position: 'left',
    },
    {
      element: '[data-tour="answer-options"]',
      title: t('editorOptionsTitle'),
      content: t('editorOptionsBody'),
      position: 'top',
    },
    {
      element: '[data-tour="launch-mode"]',
      title: t('editorModeTitle'),
      content: t('editorModeBody'),
      position: 'bottom',
    },
  ],
  ...chrome(t),
})

export const hostRoomTour = (t: TourTranslator): TourOptions => ({
  steps: [
    {
      element: '[data-tour="host-room-header"]',
      title: t('hostRoomTitle'),
      content: t('hostRoomBody'),
      position: 'bottom',
    },
    {
      element: '[data-tour="pin-display"]',
      title: t('hostPinTitle'),
      content: t('hostPinBody'),
      position: 'left',
    },
    {
      element: '[data-tour="qr-invite"]',
      title: t('hostQrTitle'),
      content: t('hostQrBody'),
      position: 'left',
    },
    {
      element: '[data-tour="start-game-btn"]',
      title: t('hostStartTitle'),
      content: t('hostStartBody'),
      position: 'top',
    },
  ],
  ...chrome(t),
})

export const playerJoinTour = (t: TourTranslator): TourOptions => ({
  steps: [
    {
      element: '[data-tour="join-form"]',
      title: t('joinFormTitle'),
      content: t('joinFormBody'),
      position: 'bottom',
    },
    {
      element: '[data-tour="open-rooms"]',
      title: t('joinOpenTitle'),
      content: t('joinOpenBody'),
      position: 'top',
    },
  ],
  ...chrome(t),
})
