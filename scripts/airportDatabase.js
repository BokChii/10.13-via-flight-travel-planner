/**
 * Airport Database Manager
 * SQLite 데이터베이스를 사용하여 공항 정보를 관리합니다.
 */

class AirportDatabase {
  constructor() {
    this.db = null;
    this.isInitialized = false;
  }

  /**
   * 데이터베이스 초기화
   */
  async init() {
    if (this.isInitialized) return;

    try {
      // SQLite.js 라이브러리 로드
      if (typeof SQL === 'undefined') {
        await this.loadSQLiteLibrary();
      }

      // 메모리 데이터베이스 생성
      this.db = new SQL.Database();
      
      // 테이블 생성
      await this.createTables();
      
      // 데이터 로드
      await this.loadAirportData();
      
      this.isInitialized = true;
      console.log('✅ Airport Database initialized successfully');
    } catch (error) {
      console.error('❌ Database initialization failed:', error);
      throw error;
    }
  }

  /**
   * SQLite.js 라이브러리 동적 로드
   */
  async loadSQLiteLibrary() {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/sql.js@1.8.0/dist/sql-wasm.js';
      script.onload = () => {
        // WASM 파일 로드
        const wasmScript = document.createElement('script');
        wasmScript.src = 'https://cdn.jsdelivr.net/npm/sql.js@1.8.0/dist/sql-wasm.wasm';
        wasmScript.onload = resolve;
        wasmScript.onerror = reject;
        document.head.appendChild(wasmScript);
      };
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  /**
   * 테이블 생성
   */
  async createTables() {
    const createTablesSQL = `
      -- 라운지, 휴게실, 호텔
      CREATE TABLE IF NOT EXISTS rests_db_frame (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        rest_name TEXT NOT NULL,
        open_time TEXT,
        close_time TEXT,
        business_hours TEXT,
        location TEXT,
        information TEXT,
        phone_number TEXT,
        blog TEXT,
        cost TEXT,
        type TEXT,
        layover_airport_id TEXT,
        image_url TEXT
      );

      -- 공항 내 관광지/어트랙션
      CREATE TABLE IF NOT EXISTS airport_events_db_frame (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_name TEXT NOT NULL,
        location TEXT,
        open_time TEXT,
        close_time TEXT,
        business_hours TEXT,
        information TEXT,
        cost TEXT,
        reservation_url TEXT,
        type TEXT,
        layover_airport_id TEXT,
        image_url TEXT
      );

      -- 식당, 카페, 디저트
      CREATE TABLE IF NOT EXISTS meal_options_db_frame (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        meal_name TEXT NOT NULL,
        open_time TEXT,
        close_time TEXT,
        business_hours TEXT,
        location TEXT,
        information TEXT,
        cost TEXT,
        blog TEXT,
        phone_number TEXT,
        type TEXT,
        layover_airport_id TEXT,
        image_url TEXT
      );

      -- 쇼핑, 패션, 면세점
      CREATE TABLE IF NOT EXISTS shopping_options_db_frame (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        shopping_options_name TEXT NOT NULL,
        open_time TEXT,
        close_time TEXT,
        business_hours TEXT,
        location TEXT,
        information TEXT,
        cost TEXT,
        blog TEXT,
        phone_number TEXT,
        type TEXT,
        layover_airport_id TEXT,
        image_url TEXT
      );

      -- 공항 기본 정보
      CREATE TABLE IF NOT EXISTS layover_airport_db_frame (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        layover_airport_id TEXT UNIQUE NOT NULL,
        layover_airport_name TEXT,
        layover_airport_eng_name TEXT,
        wifi TEXT,
        wifi_header TEXT,
        smoking_area TEXT,
        smoking_header TEXT,
        shower_facilities TEXT,
        shower_facilities_header TEXT,
        pharmacy TEXT,
        clinics_pharmacies_header TEXT,
        currency_exchange TEXT,
        currency_exchange_header TEXT,
        luggage_storage TEXT,
        luggage_storage_header TEXT,
        information_center TEXT,
        information_center_header TEXT,
        skytrain TEXT,
        skytrain_in_airport_header TEXT,
        shuttle_bus TEXT,
        shuttle_bus_in_airport_header TEXT,
        train_mrt TEXT,
        train_mrt_out_airport_header TEXT,
        taxi TEXT,
        taxi_out_airport_header TEXT,
        public_bus TEXT,
        public_bus_out_airport_header TEXT,
        airport_transfer_bus TEXT,
        airport_transfer_out_airport_header TEXT,
        airport_shuttle_bus TEXT,
        shuttle_bus_out_airport_header TEXT
      );

      -- 공항 외부 음식점
      CREATE TABLE IF NOT EXISTS food_spot_db_frame (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        food_spot_name TEXT NOT NULL,
        open_time TEXT,
        close_time TEXT,
        business_time TEXT,
        information TEXT,
        phone_number TEXT,
        type TEXT,
        image_url TEXT,
        layover_airport_id TEXT
      );

      -- 유료 관광 활동
      CREATE TABLE IF NOT EXISTS paid_activity_db_frame (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        paid_activity_name TEXT NOT NULL,
        open_time TEXT,
        close_time TEXT,
        used_time REAL,
        business_time TEXT,
        information TEXT,
        cost TEXT,
        homepage TEXT,
        type TEXT,
        image_url TEXT,
        layover_airport_id TEXT
      );

      -- 무료 투어
      CREATE TABLE IF NOT EXISTS free_tour_db_frame (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        free_tour_name TEXT NOT NULL,
        route TEXT,
        business_time TEXT,
        information TEXT,
        cost TEXT,
        homepage TEXT,
        type TEXT,
        image_url TEXT,
        layover_airport_id TEXT
      );
    `;

    this.db.exec(createTablesSQL);
  }

  /**
   * 공항 데이터 로드
   */
  async loadAirportData() {
    try {
      const response = await fetch('data/data.sql');
      const sqlContent = await response.text();
      
      // SQL 파일 파싱 및 실행
      const statements = this.parseSQLStatements(sqlContent);
      
      for (const statement of statements) {
        if (statement.trim()) {
          try {
            this.db.exec(statement);
          } catch (error) {
            console.warn('SQL statement failed:', statement.substring(0, 100) + '...', error);
          }
        }
      }
      
      console.log('✅ Airport data loaded successfully');
    } catch (error) {
      console.error('❌ Failed to load airport data:', error);
      throw error;
    }
  }

  /**
   * SQL 문장 파싱
   */
  parseSQLStatements(sqlContent) {
    // 주석 제거
    const cleanSQL = sqlContent.replace(/--.*$/gm, '');
    
    // 세미콜론으로 분리
    const statements = cleanSQL.split(';')
      .map(stmt => stmt.trim())
      .filter(stmt => stmt.length > 0 && !stmt.startsWith('--'));
    
    return statements;
  }

  /**
   * 공항별 시설 조회
   */
  async getAirportFacilities(airportId, category = null) {
    if (!this.isInitialized) await this.init();

    const facilities = [];
    
    // 모든 테이블에서 데이터 조회
    const tables = [
      'rests_db_frame',
      'airport_events_db_frame', 
      'meal_options_db_frame',
      'shopping_options_db_frame',
      'food_spot_db_frame',
      'paid_activity_db_frame',
      'free_tour_db_frame'
    ];

    for (const table of tables) {
      let query = `SELECT * FROM ${table} WHERE layover_airport_id = ?`;
      const params = [airportId];
      
      if (category) {
        query += ' AND type = ?';
        params.push(category);
      }

      try {
        const result = this.db.exec(query, params);
        if (result.length > 0) {
          const columns = result[0].columns;
          const values = result[0].values;
          
          for (const row of values) {
            const facility = {};
            columns.forEach((col, index) => {
              facility[col] = row[index];
            });
            facility.table_name = table;
            facilities.push(facility);
          }
        }
      } catch (error) {
        console.warn(`Query failed for table ${table}:`, error);
      }
    }

    return facilities;
  }

  /**
   * 카테고리별 시설 조회
   */
  async getFacilitiesByCategory(airportId, category) {
    return await this.getAirportFacilities(airportId, category);
  }

  /**
   * 공항 기본 정보 조회
   */
  async getAirportInfo(airportId) {
    if (!this.isInitialized) await this.init();

    const result = this.db.exec(
      'SELECT * FROM layover_airport_db_frame WHERE layover_airport_id = ?',
      [airportId]
    );

    if (result.length > 0) {
      const columns = result[0].columns;
      const values = result[0].values[0];
      
      const airportInfo = {};
      columns.forEach((col, index) => {
        airportInfo[col] = values[index];
      });
      
      return airportInfo;
    }

    return null;
  }

  /**
   * 시설 검색
   */
  async searchFacilities(airportId, searchTerm) {
    if (!this.isInitialized) await this.init();

    const facilities = [];
    const tables = [
      'rests_db_frame',
      'airport_events_db_frame',
      'meal_options_db_frame', 
      'shopping_options_db_frame',
      'food_spot_db_frame',
      'paid_activity_db_frame',
      'free_tour_db_frame'
    ];

    for (const table of tables) {
      const nameColumn = table === 'shopping_options_db_frame' ? 'shopping_options_name' : 
                        table === 'airport_events_db_frame' ? 'event_name' :
                        table === 'meal_options_db_frame' ? 'meal_name' :
                        table === 'food_spot_db_frame' ? 'food_spot_name' :
                        table === 'paid_activity_db_frame' ? 'paid_activity_name' :
                        table === 'free_tour_db_frame' ? 'free_tour_name' : 'rest_name';

      const query = `SELECT * FROM ${table} WHERE layover_airport_id = ? AND (${nameColumn} LIKE ? OR information LIKE ?)`;
      
      try {
        const result = this.db.exec(query, [airportId, `%${searchTerm}%`, `%${searchTerm}%`]);
        if (result.length > 0) {
          const columns = result[0].columns;
          const values = result[0].values;
          
          for (const row of values) {
            const facility = {};
            columns.forEach((col, index) => {
              facility[col] = row[index];
            });
            facility.table_name = table;
            facilities.push(facility);
          }
        }
      } catch (error) {
        console.warn(`Search failed for table ${table}:`, error);
      }
    }

    return facilities;
  }

  /**
   * 운영 중인 시설만 조회
   */
  async getOperatingFacilities(airportId, currentTime = null) {
    if (!currentTime) {
      currentTime = new Date();
    }

    const allFacilities = await this.getAirportFacilities(airportId);
    const operatingFacilities = [];

    for (const facility of allFacilities) {
      if (this.isFacilityOperating(facility, currentTime)) {
        operatingFacilities.push(facility);
      }
    }

    return operatingFacilities;
  }

  /**
   * 시설 운영 상태 확인
   */
  isFacilityOperating(facility, currentTime) {
    const openTime = facility.open_time;
    const closeTime = facility.close_time;

    if (!openTime || !closeTime) return true; // 운영시간 정보가 없으면 운영 중으로 간주

    // 24시간 운영
    if (openTime === '0' && closeTime === '24') return true;

    const currentHour = currentTime.getHours();
    const currentMinute = currentTime.getMinutes();
    const currentMinutes = currentHour * 60 + currentMinute;

    const openMinutes = parseFloat(openTime) * 60;
    const closeMinutes = parseFloat(closeTime) * 60;

    // 자정을 넘어가는 경우 처리
    if (closeMinutes < openMinutes) {
      return currentMinutes >= openMinutes || currentMinutes <= closeMinutes;
    } else {
      return currentMinutes >= openMinutes && currentMinutes <= closeMinutes;
    }
  }
}

// 전역 인스턴스 생성
window.airportDB = new AirportDatabase();

export default AirportDatabase;
