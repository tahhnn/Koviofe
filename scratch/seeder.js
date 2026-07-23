const fs = require('fs');
const path = require('path');

const BACKEND_URL = 'http://localhost:8082/api';
const NUM_PLAYERS = 1000; // Số lượng người chơi giả lập đăng ký trước

async function run() {
  console.log('=== STARTING SEEDER FOR LOAD TESTING ===');

  try {
    // 1. Register a new host
    const email = `host_loadtest_${Date.now()}@email.com`;
    console.log(`1. Registering Host: ${email}`);
    const regRes = await fetch(`${BACKEND_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });
    
    if (!regRes.ok) {
      const err = await regRes.text();
      throw new Error(`Failed to register host: ${err}`);
    }
    
    const regData = await regRes.json();
    const password = regData.password;
    console.log(`-> Host registered successfully. Temp Password: ${password}`);

    // 2. Login to get JWT
    console.log('2. Logging in...');
    const loginRes = await fetch(`${BACKEND_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    
    if (!loginRes.ok) {
      const err = await loginRes.text();
      throw new Error(`Failed to login: ${err}`);
    }
    
    const loginData = await loginRes.json();
    const token = loginData.token;
    console.log('-> Login successful. JWT token received.');

    // 3. Create Quiz
    console.log('3. Creating Quiz...');
    const quizRes = await fetch(`${BACKEND_URL}/quizzes`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        title: 'Load Test Quiz Arena',
        description: 'Automated quiz for load testing with Artillery',
        theme_config: JSON.stringify({}),
        questions: [
          {
            content: 'Which language is used for Go Backend?',
            type: 'multiple_choice',
            options: [
              { id: 'A', text: 'Python', isCorrect: false },
              { id: 'B', text: 'Go', isCorrect: true },
              { id: 'C', text: 'JavaScript', isCorrect: false },
              { id: 'D', text: 'Ruby', isCorrect: false }
            ],
            correct_answer: 'B',
            duration: 120,
            points: 1000,
            order: 1
          }
        ]
      })
    });

    if (!quizRes.ok) {
      const err = await quizRes.text();
      throw new Error(`Failed to create quiz: ${err}`);
    }

    const quizData = await quizRes.json();
    const quizId = quizData.id;
    // Get question ID from the response (backend model Quiz has ID and Questions relation)
    // Note that quizData might contain Questions directly
    let questionId = null;
    
    // We fetch the full quiz just in case to obtain question IDs
    const getQuizRes = await fetch(`${BACKEND_URL}/quizzes/${quizId}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const fullQuiz = await getQuizRes.json();
    if (fullQuiz.questions && fullQuiz.questions.length > 0) {
      questionId = fullQuiz.questions[0].id;
    } else {
      throw new Error('No questions found in created quiz');
    }
    console.log(`-> Quiz created. ID: ${quizId}, Question ID: ${questionId}`);

    // 4. Create Room (waiting status)
    console.log(`4. Creating Room for Quiz ID: ${quizId}...`);
    const roomRes = await fetch(`${BACKEND_URL}/rooms?quiz_id=${quizId}`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!roomRes.ok) {
      const err = await roomRes.text();
      throw new Error(`Failed to create room: ${err}`);
    }

    const roomData = await roomRes.json();
    const roomId = roomData.id;
    const pinCode = roomData.pin_code;
    console.log(`-> Room created. ID: ${roomId}, PIN: ${pinCode}`);

    // 5. Generate and Join Players to Room (in waiting state)
    console.log(`5. Registering ${NUM_PLAYERS} players into Room...`);
    const playerIds = [];
    
    // Run in chunks to prevent connection timeout
    const chunkSize = 50;
    for (let i = 0; i < NUM_PLAYERS; i += chunkSize) {
      const promises = [];
      const endLimit = Math.min(i + chunkSize, NUM_PLAYERS);
      
      for (let j = i; j < endLimit; j++) {
        promises.push(
          fetch(`${BACKEND_URL}/rooms/join`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              pin_code: pinCode,
              nickname: `player_load_${j}_${Math.floor(Math.random() * 10000)}`
            })
          }).then(async (res) => {
            if (res.ok) {
              const data = await res.json();
              playerIds.push(data.player_id);
            } else {
              console.error(`Player ${j} failed to join: ${res.statusText}`);
            }
          }).catch(err => {
            console.error(`Network error for Player ${j}:`, err.message);
          })
        );
      }
      
      await Promise.all(promises);
      console.log(`-> Registered players: ${playerIds.length}/${NUM_PLAYERS}`);
    }

    if (playerIds.length === 0) {
      throw new Error('Zero players registered successfully. Check database/connections.');
    }

    // Write players to CSV
    const csvContent = 'playerId\n' + playerIds.join('\n');
    const csvPath = path.join(__dirname, 'players.csv');
    fs.writeFileSync(csvPath, csvContent);
    console.log(`-> Saved ${playerIds.length} Player IDs to ${csvPath}`);

    // 6. Start the Game (turns status to active)
    console.log('6. Starting Game Room...');
    const startRes = await fetch(`${BACKEND_URL}/rooms/${roomId}/start`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!startRes.ok) {
      const err = await startRes.text();
      throw new Error(`Failed to start game: ${err}`);
    }
    console.log('-> Game room is now ACTIVE.');

    // 7. Activate the first question
    console.log('7. Activating Question...');
    const nextRes = await fetch(`${BACKEND_URL}/rooms/${roomId}/next`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!nextRes.ok) {
      const err = await nextRes.text();
      throw new Error(`Failed to activate question: ${err}`);
    }
    console.log('-> First question is now ACTIVE for submissions.');

    // 8. Generate Artillery Load Test YAML dynamically
    console.log('8. Generating Artillery YAML configurations...');
    const artilleryConfig = `
config:
  target: "http://localhost:8082/api"
  phases:
    - duration: 20
      arrivalRate: 20
      name: "Warm up phase"
    - duration: 30
      arrivalRate: 150
      name: "Sustained heavy load"
  payload:
    path: "./players.csv"
    fields:
      - "playerId"
    order: "sequence"
scenarios:
  - name: "Submit Answer Arena Load Test"
    flow:
      - post:
          url: "/rooms/submit-answer"
          headers:
            X-Player-ID: "{{ playerId }}"
          json:
            question_id: ${questionId}
            selected_option: "B"
            response_time_ms: 1200
`;

    const yamlPath = path.join(__dirname, 'submit-test.yaml');
    fs.writeFileSync(yamlPath, artilleryConfig.trim());
    console.log(`-> Saved Artillery config to ${yamlPath}`);

    // Create another Room for testing JOIN capability
    console.log('9. Creating secondary Room for JOIN Load Test...');
    const joinRoomRes = await fetch(`${BACKEND_URL}/rooms?quiz_id=${quizId}`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if (joinRoomRes.ok) {
      const joinRoomData = await joinRoomRes.json();
      const joinPinCode = joinRoomData.pin_code;
      console.log(`-> Secondary Room for JOIN test created. PIN: ${joinPinCode}`);

      const joinArtConfig = `
config:
  target: "http://localhost:8082/api"
  phases:
    - duration: 20
      arrivalRate: 15
      name: "Warm up"
    - duration: 30
      arrivalRate: 100
      name: "Sustained Join load"
scenarios:
  - name: "Join Room Load Test"
    flow:
      - post:
          url: "/rooms/join"
          json:
            pin_code: "${joinPinCode}"
            nickname: "player_join_{{ $randomString(6) }}"
`;
      const joinYamlPath = path.join(__dirname, 'join-test.yaml');
      fs.writeFileSync(joinYamlPath, joinArtConfig.trim());
      console.log(`-> Saved Join test Artillery config to ${joinYamlPath}`);
    }

    console.log('=== SEEDING COMPLETED SUCCESSFULLY ===');
    console.log(`Use the following commands to run tests:
1. Submit answers test: npx artillery run scratch/submit-test.yaml
2. Join rooms test: npx artillery run scratch/join-test.yaml`);

  } catch (error) {
    console.error('!!! ERROR IN SEEDER !!!', error);
  }
}

run();
