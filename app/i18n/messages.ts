export const locales = ["ko", "ja", "en"] as const;
export type Locale = (typeof locales)[number];

const messages = {
  ko: {
    languageLabel: "언어 선택",
    brand: "EWAN'S INTERACTIVE PORTFOLIO",
    welcome: "제 세계에 오신 것을 환영합니다!",
    intro: "일본 축제 월드를 걸으며 그 안에 담긴 작업을 발견해 보세요.",
    start: "시작",
    controls: "PC 방향키 · 모바일 터치",
    chooseTitle: "캐릭터를 선택하세요",
    chooseIntro: "월드에 입장하기 전에 플레이어 캐릭터를 선택하세요.",
    male: "남성",
    female: "여성",
    selectMale: "남성 캐릭터 선택",
    selectFemale: "여성 캐릭터 선택",
    select: "선택",
    selected: "선택됨",
    enterWorld: "월드 입장",
    worldLabel: "3D 포트폴리오 월드",
    loadingWorld: "축제 월드를 불러오는 중",
    journeyBegins: "여행을 시작합니다",
    movementControl: "모바일 이동 조작",
    cameraControl: "카메라 드래그 영역",
    resetCamera: "카메라 초기화",
    resetPosition: "시작 위치로 돌아가기",
    jump: "점프",
    worldFallback:
      "월드를 표시하지 못해 읽기 가능한 포트폴리오를 대신 표시합니다.",
    portfolioLabel: "포트폴리오 장소",
    openPortfolio: "작업 보기",
    closePortfolioMenu: "작업 목록 닫기",
    closePortfolio: "포트폴리오 닫기",
    miniMap: {
      label: "월드 미니맵",
      expand: "미니맵 펼치기",
      collapse: "미니맵 접기",
      currentPosition: "현재 위치",
      mainRoute: "주 경로",
      north: "북쪽",
      destinations: {
        airport: "공항",
        tokyo: "도쿄",
        gyukatsu: "규카츠",
        sakura: "벚꽃",
        hanabi: "하나비"
      }
    },
    worldMap: {
      title: "월드 지도",
      open: "월드 지도 열기 (M 키)",
      close: "월드 지도 닫기",
      hint: "가고 싶은 장소를 누르면 그곳으로 바로 이동합니다. M 키로 열고 닫고, Esc 키로 닫습니다.",
      travelTo: "이동",
      currentPosition: "현재 위치",
      mainRoute: "주 경로",
      north: "위쪽이 북쪽",
      legendLabel: "지도 기호 설명",
      legendZone: "장소",
      legendRoute: "길",
      legendPlayer: "내 위치와 바라보는 방향",
      scale: "축척",
      destinations: {
        airport: "공항",
        tokyo: "도쿄",
        gyukatsu: "규카츠",
        sakura: "벚꽃",
        hanabi: "하나비"
      }
    },
    guide: {
      open: "길 안내",
      title: "어떤 기준으로 추천받을까요?",
      sourceWeather: "현재 날씨",
      sourceFortune: "오늘의 포춘",
      scope: "목적지와 방향만 추천해요. 이동은 직접 해주세요.",
      requesting: "추천을 찾는 중…",
      cancel: "취소",
      cancelled: "요청을 취소했습니다.",
      close: "닫기",
      chooseAgain: "다시 선택",
      destinationLabel: "추천 목적지",
      directionLabel: "가는 방향",
      fallbackNotice: "안내를 불러오지 못해 기본 추천을 보여 드립니다.",
      fallbackKeepExisting: "새 안내를 불러오지 못해 기존 추천을 유지합니다.",
      weatherTokyo: "도쿄의 현재 날씨 기준",
      weatherLive: "현재 날씨 데이터",
      weatherStale: "이전 날씨 데이터",
      weatherUnavailable: "날씨 정보 없음",
      weatherObservedAt: "데이터 기준 시각",
      weatherAttribution: "날씨 데이터: Open-Meteo",
      temperature: "기온",
      resultReady: "추천이 준비되었습니다.",
      markerLabel: "목적지",
      omamoriLabel: "오마모리가 가리키는 방향",
      fortuneDate: "도쿄 날짜",
      fortuneNotice: "재미로 보는 포춘이며 중요한 판단에 사용하지 마세요.",
      destinations: {
        airport: "공항버스 정류장",
        tokyo: "도쿄 도심 대로",
        gyukatsu: "규카츠 골목",
        sakura: "벚꽃 수로",
        hanabi: "하나비 축제"
      },
      directions: {
        straight: "직진",
        left: "왼쪽 길",
        right: "오른쪽 길",
        turnAround: "뒤로 돌아가기"
      },
      themes: {
        fresh_start: "새로운 시작에 좋은 흐름이에요.",
        focus: "한 가지에 차분히 집중해 보세요.",
        connection: "소중한 인연과 시간을 나눠 보세요.",
        curiosity: "마음이 끌리는 곳을 천천히 살펴보세요.",
        rest: "잠시 쉬어 가도 좋은 날이에요.",
        celebration: "작은 즐거움도 기쁘게 누려 보세요."
      },
      conditions: {
        clear: "맑음",
        cloudy: "흐림",
        fog: "안개",
        rain: "비",
        snow: "눈",
        thunder: "뇌우"
      }
    },
    portfolioItems: [
      {
        id: "world-design",
        title: "축제 월드 디자인",
        kicker: "입체 RPG 마을 · 낮과 밤 · 일본 축제",
        summary:
          "공항버스, 도쿄, 규카츠, 벚꽃과 하나비 장면을 하나의 이어지는 입체 RPG 마을로 구성했습니다."
      },
      {
        id: "character-controls",
        title: "캐릭터와 조작",
        kicker: "키보드 · 터치 · 카메라",
        summary:
          "두 플레이어 캐릭터, 방향키 이동, 점프, 모바일 조이스틱과 독립 카메라 조작을 함께 제공합니다."
      },
      {
        id: "ai-guide",
        title: "AI 길 안내",
        kicker: "날씨 · 포춘 · 직접 이동",
        summary:
          "현재 날씨나 오늘의 포춘을 기준으로 목적지만 추천하며, 캐릭터와 카메라는 방문자가 직접 조작합니다."
      }
    ]
  },
  ja: {
    languageLabel: "言語を選択",
    brand: "EWAN'S INTERACTIVE PORTFOLIO",
    welcome: "私の世界へようこそ！",
    intro: "日本のお祭りの世界を歩きながら、作品を見つけてください。",
    start: "スタート",
    controls: "PCは矢印キー · モバイルはタッチ",
    chooseTitle: "キャラクターを選ぶ",
    chooseIntro: "ワールドに入る前にプレイヤーキャラクターを選んでください。",
    male: "男性",
    female: "女性",
    selectMale: "男性キャラクターを選択",
    selectFemale: "女性キャラクターを選択",
    select: "選択",
    selected: "選択中",
    enterWorld: "ワールドに入る",
    worldLabel: "3Dポートフォリオワールド",
    loadingWorld: "お祭りの世界を読み込み中",
    journeyBegins: "旅が始まります",
    movementControl: "モバイル移動操作",
    cameraControl: "カメラドラッグエリア",
    resetCamera: "カメラをリセット",
    resetPosition: "スタート地点に戻る",
    jump: "ジャンプ",
    worldFallback:
      "ワールドを表示できないため、読みやすいポートフォリオを代わりに表示します。",
    portfolioLabel: "ポートフォリオの場所",
    openPortfolio: "作品を見る",
    closePortfolioMenu: "作品一覧を閉じる",
    closePortfolio: "ポートフォリオを閉じる",
    miniMap: {
      label: "ワールドミニマップ",
      expand: "ミニマップを開く",
      collapse: "ミニマップを閉じる",
      currentPosition: "現在地",
      mainRoute: "メインルート",
      north: "北",
      destinations: {
        airport: "空港",
        tokyo: "東京",
        gyukatsu: "牛カツ",
        sakura: "桜",
        hanabi: "花火"
      }
    },
    worldMap: {
      title: "ワールドマップ",
      open: "ワールドマップを開く (Mキー)",
      close: "ワールドマップを閉じる",
      hint: "行きたい場所を選ぶと、そこへすぐ移動します。Mキーで開閉、Escキーで閉じます。",
      travelTo: "移動",
      currentPosition: "現在地",
      mainRoute: "メインルート",
      north: "上が北",
      legendLabel: "地図の凡例",
      legendZone: "エリア",
      legendRoute: "道",
      legendPlayer: "現在地と向いている方向",
      scale: "縮尺",
      destinations: {
        airport: "空港",
        tokyo: "東京",
        gyukatsu: "牛カツ",
        sakura: "桜",
        hanabi: "花火"
      }
    },
    guide: {
      open: "道案内",
      title: "何をもとにおすすめしますか？",
      sourceWeather: "現在の天気",
      sourceFortune: "今日の運勢",
      scope: "目的地と方向だけをおすすめします。移動はご自身で操作してください。",
      requesting: "おすすめを探しています…",
      cancel: "キャンセル",
      cancelled: "リクエストをキャンセルしました。",
      close: "閉じる",
      chooseAgain: "選び直す",
      destinationLabel: "おすすめの行き先",
      directionLabel: "進む方向",
      fallbackNotice: "案内を取得できなかったため、基本のおすすめを表示します。",
      fallbackKeepExisting: "新しい案内を取得できなかったため、現在のおすすめを維持します。",
      weatherTokyo: "東京の現在の天気を使用",
      weatherLive: "現在の天気データ",
      weatherStale: "過去の天気データ",
      weatherUnavailable: "天気情報なし",
      weatherObservedAt: "データ基準時刻",
      weatherAttribution: "天気データ: Open-Meteo",
      temperature: "気温",
      resultReady: "おすすめが決まりました。",
      markerLabel: "目的地",
      omamoriLabel: "お守りが示す方向",
      fortuneDate: "東京の日付",
      fortuneNotice: "娯楽としての運勢です。重要な判断には使用しないでください。",
      destinations: {
        airport: "空港バス乗り場",
        tokyo: "東京の大通り",
        gyukatsu: "牛カツ横丁",
        sakura: "桜の運河",
        hanabi: "花火大会"
      },
      directions: {
        straight: "まっすぐ",
        left: "左の道",
        right: "右の道",
        turnAround: "引き返す"
      },
      themes: {
        fresh_start: "新しい一歩に向いた流れです。",
        focus: "一つのことに落ち着いて集中してみましょう。",
        connection: "大切な人との時間を楽しんでみましょう。",
        curiosity: "気になる場所をゆっくり巡ってみましょう。",
        rest: "少し立ち止まって休むのもよい日です。",
        celebration: "小さな喜びも楽しく味わってみましょう。"
      },
      conditions: {
        clear: "晴れ",
        cloudy: "曇り",
        fog: "霧",
        rain: "雨",
        snow: "雪",
        thunder: "雷雨"
      }
    },
    portfolioItems: [
      {
        id: "world-design",
        title: "祭りワールドデザイン",
        kicker: "立体RPGの町 · 昼と夜 · 日本の祭り",
        summary:
          "空港バス、東京、牛カツ、桜、花火の風景を、一続きの立体RPGの町として構成しています。"
      },
      {
        id: "character-controls",
        title: "キャラクターと操作",
        kicker: "キーボード · タッチ · カメラ",
        summary:
          "2人のプレイヤーキャラクター、矢印キー移動、ジャンプ、モバイルジョイスティック、独立したカメラ操作を用意しています。"
      },
      {
        id: "ai-guide",
        title: "AI道案内",
        kicker: "天気 · 運勢 · 直接操作",
        summary:
          "現在の天気や今日の運勢をもとに目的地だけをおすすめし、キャラクターとカメラは訪問者が直接操作します。"
      }
    ]
  },
  en: {
    languageLabel: "Choose language",
    brand: "EWAN'S INTERACTIVE PORTFOLIO",
    welcome: "WELCOME TO MY WORLD!",
    intro:
      "Walk through a Japanese festival world and discover the work behind it.",
    start: "START",
    controls: "Arrow keys on desktop · Touch on mobile",
    chooseTitle: "CHOOSE YOUR CHARACTER",
    chooseIntro: "Choose a character before entering.",
    male: "MALE",
    female: "FEMALE",
    selectMale: "Select male character",
    selectFemale: "Select female character",
    select: "SELECT",
    selected: "SELECTED",
    enterWorld: "ENTER WORLD",
    worldLabel: "3D portfolio world",
    loadingWorld: "LOADING THE FESTIVAL WORLD",
    journeyBegins: "YOUR JOURNEY BEGINS",
    movementControl: "Mobile movement control",
    cameraControl: "Camera drag area",
    resetCamera: "Reset camera",
    resetPosition: "Return to start",
    jump: "Jump",
    worldFallback:
      "The world could not be displayed, so the readable portfolio is shown instead.",
    portfolioLabel: "Portfolio landmarks",
    openPortfolio: "View work",
    closePortfolioMenu: "Close work list",
    closePortfolio: "Close portfolio",
    miniMap: {
      label: "World mini-map",
      expand: "Expand mini-map",
      collapse: "Collapse mini-map",
      currentPosition: "Current position",
      mainRoute: "Main route",
      north: "North",
      destinations: {
        airport: "Airport",
        tokyo: "Tokyo",
        gyukatsu: "Gyukatsu",
        sakura: "Sakura",
        hanabi: "Hanabi"
      }
    },
    worldMap: {
      title: "World map",
      open: "Open world map (M key)",
      close: "Close world map",
      hint: "Choose a place to travel straight there. Press M to open or close, Esc to close.",
      travelTo: "Travel to",
      currentPosition: "Current position",
      mainRoute: "Main route",
      north: "North is up",
      legendLabel: "Map legend",
      legendZone: "Place",
      legendRoute: "Road",
      legendPlayer: "You and the way you face",
      scale: "Scale",
      destinations: {
        airport: "Airport",
        tokyo: "Tokyo",
        gyukatsu: "Gyukatsu",
        sakura: "Sakura",
        hanabi: "Hanabi"
      }
    },
    guide: {
      open: "Directions",
      title: "What should guide today's recommendation?",
      sourceWeather: "Current weather",
      sourceFortune: "Today's fortune",
      scope: "We'll recommend a destination and direction. You stay in control of movement.",
      requesting: "Finding a recommendation…",
      cancel: "Cancel",
      cancelled: "Request canceled.",
      close: "Close",
      chooseAgain: "Choose again",
      destinationLabel: "Recommended destination",
      directionLabel: "Direction",
      fallbackNotice: "We couldn't load guidance, so we're showing a default recommendation.",
      fallbackKeepExisting: "We couldn't load new guidance, so your current recommendation remains active.",
      weatherTokyo: "Using current Tokyo weather",
      weatherLive: "Current weather data",
      weatherStale: "Previous weather data",
      weatherUnavailable: "Weather unavailable",
      weatherObservedAt: "Data time",
      weatherAttribution: "Weather data by Open-Meteo",
      temperature: "Temperature",
      resultReady: "Recommendation ready.",
      markerLabel: "Destination",
      omamoriLabel: "Omamori direction",
      fortuneDate: "Tokyo date",
      fortuneNotice: "This fortune is for fun and should not guide important decisions.",
      destinations: {
        airport: "Airport bus stop",
        tokyo: "Tokyo boulevard",
        gyukatsu: "Gyukatsu alley",
        sakura: "Sakura canal",
        hanabi: "Fireworks festival"
      },
      directions: {
        straight: "Straight ahead",
        left: "Left path",
        right: "Right path",
        turnAround: "Turn around"
      },
      themes: {
        fresh_start: "A good moment for a fresh start.",
        focus: "Take a calm moment to focus on one thing.",
        connection: "Share some time with someone you value.",
        curiosity: "Take your time exploring what sparks your curiosity.",
        rest: "It is a good day to pause and rest.",
        celebration: "Enjoy even the small reasons to celebrate."
      },
      conditions: {
        clear: "Clear",
        cloudy: "Cloudy",
        fog: "Fog",
        rain: "Rain",
        snow: "Snow",
        thunder: "Thunderstorm"
      }
    },
    portfolioItems: [
      {
        id: "world-design",
        title: "Festival World Design",
        kicker: "Volumetric RPG town · Day and night · Japanese festival",
        summary:
          "Airport bus, Tokyo, gyukatsu, sakura, and hanabi scenes form one continuous explorable RPG town."
      },
      {
        id: "character-controls",
        title: "Characters and Controls",
        kicker: "Keyboard · Touch · Camera",
        summary:
          "Two player characters, arrow-key movement, jumping, a mobile joystick, and independent camera controls are included."
      },
      {
        id: "ai-guide",
        title: "AI Directions",
        kicker: "Weather · Fortune · Direct control",
        summary:
          "Current weather or today's fortune can suggest a destination while movement and camera control stay with the visitor."
      }
    ]
  }
} as const;

export function getMessages(locale: Locale) {
  return messages[locale];
}

export function isLocale(value: string): value is Locale {
  return locales.includes(value as Locale);
}
