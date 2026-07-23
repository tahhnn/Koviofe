import { TourOptions } from '@/hooks/use-step-tour'

export const dashboardTour: TourOptions = {
  steps: [
    {
      element: '[data-tour="dashboard-header"]',
      title: 'Chào mừng đến Kovio',
      content: 'Đây là bảng điều khiển chính. Bạn có thể tạo quiz, nhân bản và theo dõi kết quả từ đây.',
      position: 'bottom',
    },
    {
      element: '[data-tour="create-quiz-btn"]',
      title: 'Tạo Quiz mới',
      content: 'Nhấn nút này để tạo một bộ câu hỏi mới. Sau đó bạn sẽ vào trình chỉnh sửa để thêm câu hỏi và cấu hình.',
      position: 'left',
    },
    {
      element: '[data-tour="stats-grid"]',
      title: 'Thống kê nhanh',
      content: 'Theo dõi tổng số quiz, số trận đã host, số người chơi và tỷ lệ trả lời đúng trung bình.',
      position: 'top',
    },
    {
      element: '[data-tour="quiz-tabs"]',
      title: 'Điều hướng nội dung',
      content: 'Chuyển giữa danh sách Quiz và Starter packs. Muốn tái sử dụng câu: Nhân bản quiz, hoặc trong editor chọn Thêm từ quiz.',
      position: 'bottom',
    },
    {
      element: '[data-tour="quiz-list"]',
      title: 'Danh sách Quiz',
      content: 'Mỗi quiz có thể chỉnh sửa, xóa hoặc phóng to thành một phòng chơi. Nhấn Launch để bắt đầu!',
      position: 'top',
    },
  ],
  overlayColor: 'rgba(0, 0, 0, 0.75)',
  highlightPadding: 12,
  showSkipButton: true,
  showProgress: true,
  scrollBehavior: 'smooth',
  animation: true,
  finishLabel: 'Finish',
  nextLabel: 'Next',
  prevLabel: 'Back',
  skipLabel: 'Skip',
  onComplete: () => {
    console.log('Dashboard tour completed')
  },
  onSkip: () => {
    console.log('Dashboard tour skipped')
  },
}

export const quizEditorTour: TourOptions = {
  steps: [
    {
      element: '[data-tour="quiz-editor-header"]',
      title: 'Trình chỉnh sửa Quiz',
      content: 'Tại đây bạn thiết lập tiêu đề, mô tả và cấu hình chế độ chơi Classic hoặc Solo.',
      position: 'bottom',
    },
    {
      element: '[data-tour="question-slides"]',
      title: 'Danh sách câu hỏi',
      content: 'Chuyển đổi giữa các câu hỏi. Nhấn vào slide để chỉnh sửa nội dung, đáp án và thời gian.',
      position: 'right',
    },
    {
      element: '[data-tour="question-editor"]',
      title: 'Nội dung câu hỏi',
      content: 'Nhập câu hỏi, thêm hình ảnh/media và chọn loại câu hỏi (multiple choice, true/false, short answer).',
      position: 'left',
    },
    {
      element: '[data-tour="answer-options"]',
      title: 'Các lựa chọn đáp án',
      content: 'Thêm, sửa hoặc xóa đáp án. Đánh dấu đáp án đúng để hệ thống tính điểm chính xác.',
      position: 'top',
    },
    {
      element: '[data-tour="launch-mode"]',
      title: 'Chọn chế độ chơi',
      content: 'Classic: host điều khiển câu hỏi. Solo: mỗi người chơi tự trả lời theo tốc độ riêng.',
      position: 'bottom',
    },
  ],
  overlayColor: 'rgba(0, 0, 0, 0.75)',
  highlightPadding: 12,
  showSkipButton: true,
  showProgress: true,
  scrollBehavior: 'smooth',
  animation: true,
  finishLabel: 'Finish',
  nextLabel: 'Next',
  prevLabel: 'Back',
  skipLabel: 'Skip',
}

export const hostRoomTour: TourOptions = {
  steps: [
    {
      element: '[data-tour="host-room-header"]',
      title: 'Phòng Host',
      content: 'Bạn đang ở phòng điều khiển. Mời người chơi bằng PIN hoặc QR code.',
      position: 'bottom',
    },
    {
      element: '[data-tour="pin-display"]',
      title: 'Mã PIN',
      content: 'Người chơi nhập mã PIN này tại /join để tham gia phòng.',
      position: 'left',
    },
    {
      element: '[data-tour="qr-invite"]',
      title: 'QR Code',
      content: 'Quét mã QR để vào phòng nhanh chóng, hoặc sao chép link mời.',
      position: 'left',
    },
    {
      element: '[data-tour="start-game-btn"]',
      title: 'Bắt đầu game',
      content: 'Sau khi có người chơi, nhấn Start game để bắt đầu vòng hỏi đáp.',
      position: 'top',
    },
  ],
  overlayColor: 'rgba(0, 0, 0, 0.75)',
  highlightPadding: 12,
  showSkipButton: true,
  showProgress: true,
  scrollBehavior: 'smooth',
  animation: true,
  finishLabel: 'Finish',
  nextLabel: 'Next',
  prevLabel: 'Back',
  skipLabel: 'Skip',
}

export const playerJoinTour: TourOptions = {
  steps: [
    {
      element: '[data-tour="join-form"]',
      title: 'Tham gia phòng',
      content: 'Nhập mã PIN 6 chữ số và nickname để tham gia vào phòng chơi.',
      position: 'bottom',
    },
    {
      element: '[data-tour="open-rooms"]',
      title: 'Phòng mở',
      content: 'Hoặc chọn một phòng công khai từ danh sách để tham gia ngay.',
      position: 'top',
    },
  ],
  overlayColor: 'rgba(0, 0, 0, 0.75)',
  highlightPadding: 12,
  showSkipButton: true,
  showProgress: true,
  scrollBehavior: 'smooth',
  animation: true,
  finishLabel: 'Finish',
  nextLabel: 'Next',
  prevLabel: 'Back',
  skipLabel: 'Skip',
}
