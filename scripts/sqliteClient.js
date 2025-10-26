/**
 * SQLite Database Client Service
 * 클라이언트에서 SQLite 데이터베이스를 사용하기 위한 서비스
 */

class SQLiteClient {
  constructor() {
    this.db = null;
    this.isInitialized = false;
    this.dbPath = 'data/airport.db';
  }

  /**
   * SQLite 데이터베이스 초기화
   */
  async initialize() {
    if (this.isInitialized) {
      return;
    }

    try {
      console.log('SQLite 클라이언트 초기화 시작...');
      
      // sql.js 라이브러리 동적 로드
      if (typeof SQL === 'undefined') {
        await this.loadSQLJS();
      }

      // 데이터베이스 파일 로드
      const response = await fetch(this.dbPath);
      const arrayBuffer = await response.arrayBuffer();
      
      // SQLite 데이터베이스 인스턴스 생성
      this.db = new SQL.Database(new Uint8Array(arrayBuffer));
      
      this.isInitialized = true;
      console.log('SQLite 클라이언트 초기화 완료');
      
    } catch (error) {
      console.error('SQLite 클라이언트 초기화 실패:', error);
      throw error;
    }
  }

  /**
   * sql.js 라이브러리 동적 로드 (initSqlJs 사용)
   */
  async loadSQLJS() {
    return new Promise((resolve, reject) => {
      // 기존 SQL 객체가 있는지 확인
      if (typeof SQL !== 'undefined') {
        resolve();
        return;
      }

      // initSqlJs를 직접 로드
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.8.0/sql-wasm.js';
      script.onload = async () => {
        try {
          console.log('sql.js 라이브러리 로드 완료');
          
          // initSqlJs 함수 사용
          const initSqlJs = window.initSqlJs;
          if (!initSqlJs) {
            throw new Error('initSqlJs 함수를 찾을 수 없습니다');
          }
          
          const SQL = await initSqlJs({
            locateFile: file => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.8.0/${file}`
          });
          
          // 전역 SQL 객체 설정
          window.SQL = SQL;
          console.log('SQL 객체 초기화 완료');
          resolve();
          
        } catch (error) {
          console.error('SQL 초기화 실패:', error);
          reject(error);
        }
      };
      script.onerror = (error) => {
        console.error('sql.js 라이브러리 로드 실패:', error);
        reject(error);
      };
      document.head.appendChild(script);
    });
  }

  /**
   * SQL 쿼리 실행
   */
  executeQuery(sql, params = []) {
    if (!this.isInitialized || !this.db) {
      throw new Error('데이터베이스가 초기화되지 않았습니다.');
    }

    try {
      const stmt = this.db.prepare(sql);
      const result = stmt.getAsObject(params);
      stmt.free();
      return result;
    } catch (error) {
      console.error('쿼리 실행 실패:', error);
      throw error;
    }
  }

  /**
   * 여러 행 반환 쿼리 실행
   */
  executeQueryAll(sql, params = []) {
    if (!this.isInitialized || !this.db) {
      throw new Error('데이터베이스가 초기화되지 않았습니다.');
    }

    try {
      const stmt = this.db.prepare(sql);
      const results = [];
      
      while (stmt.step()) {
        results.push(stmt.getAsObject());
      }
      
      stmt.free();
      return results;
    } catch (error) {
      console.error('쿼리 실행 실패:', error);
      throw error;
    }
  }

  /**
   * 테이블의 타입들 조회
   */
  async getTableTypes(tableName) {
    await this.initialize();

    let sql = `SELECT DISTINCT type FROM ${tableName} WHERE layover_airport_id = 'SIN' ORDER BY type`;
    
    try {
      const results = this.executeQueryAll(sql);
      return results.map(row => row.type).filter(type => type);
    } catch (error) {
      console.error('테이블 타입 조회 실패:', error);
      return [];
    }
  }

  /**
   * 특정 테이블의 POI 데이터 조회 (카테고리 필터 지원)
   */
  async getTablePOIs(tableName, categoryFilter = null) {
    await this.initialize();

    let sql = '';
    let nameColumn = '';
    let descriptionColumn = '';
    let websiteColumn = '';

    switch (tableName) {
      case 'rests_db_frame':
        nameColumn = 'rest_name';
        descriptionColumn = 'information';
        websiteColumn = 'blog';
        break;
      case 'meal_options_db_frame':
        nameColumn = 'meal_name';
        descriptionColumn = 'information';
        websiteColumn = 'blog';
        break;
      case 'shopping_options_db_frame':
        nameColumn = 'shopping_options_name';
        descriptionColumn = 'information';
        websiteColumn = 'blog';
        break;
      case 'airport_events_db_frame':
        nameColumn = 'event_name';
        descriptionColumn = 'information';
        websiteColumn = 'reservation_url';
        break;
      default:
        throw new Error(`지원하지 않는 테이블: ${tableName}`);
    }

    // 카테고리 필터 적용
    let categoryWhere = '';
    if (categoryFilter && categoryFilter !== 'all') {
      categoryWhere = `AND type = '${categoryFilter}'`;
    }

    sql = `
      SELECT 
        ${nameColumn} as name,
        type as category,
        location,
        ${descriptionColumn} as description,
        business_hours,
        ${websiteColumn} as website,
        cost,
        image_url,
        '${tableName}' as table_name
        ${tableName === 'airport_events_db_frame' ? '' : ', phone_number'}
      FROM ${tableName} 
      WHERE layover_airport_id = 'SIN' ${categoryWhere}
      ORDER BY name
    `;

    try {
      const results = this.executeQueryAll(sql);
      
      console.log(`📊 [${tableName}] 총 ${results.length}개 데이터 조회됨`);
      
      // 중복 확인을 위한 로그
      const nameCounts = {};
      results.forEach(row => {
        const name = row.name;
        if (!nameCounts[name]) {
          nameCounts[name] = 0;
        }
        nameCounts[name]++;
      });
      
      // 중복된 이름만 로그
      const duplicates = Object.entries(nameCounts)
        .filter(([name, count]) => count > 1)
        .map(([name, count]) => ({ name, count }));
      
      if (duplicates.length > 0) {
        console.log(`⚠️ [${tableName}] 중복된 데이터 발견:`, duplicates);
        // 각 중복 데이터의 상세 정보 출력
        duplicates.forEach(({ name }) => {
          const dupData = results.filter(row => row.name === name);
          console.log(`   "${name}" (${dupData.length}개):`, dupData.map(d => ({ location: d.location, category: d.category })));
        });
      } else {
        console.log(`✅ [${tableName}] 중복 없음`);
      }
      
      // 결과를 표준화된 형태로 변환
      const pois = results.map((row, index) => ({
        id: `${row.table_name}_${index}`,
        name: row.name || 'Unknown',
        category: row.category,
        categoryIcon: this.getCategoryIcon(row.category),
        description: row.description || '',
        location: row.location || '',
        businessHours: row.business_hours || '',
        phoneNumber: tableName === 'airport_events_db_frame' ? '' : (row.phone_number || ''),
        website: row.website || '',
        cost: row.cost || '',
        estimatedTime: this.getEstimatedTime(row.category),
        imageUrl: row.image_url || '',
        rating: 4.0 + Math.random(), // 임시 평점
        userRatingsTotal: Math.floor(Math.random() * 100) + 10 // 임시 리뷰 수
      }));
      
      console.log(`✨ [${tableName}] POI 변환 완료: ${pois.length}개`);
      
      return pois;

    } catch (error) {
      console.error(`${tableName} POI 조회 실패:`, error);
      return [];
    }
  }

  /**
   * 싱가포르 공항 POI 데이터 조회 (기존 함수 유지)
   */
  async getSingaporeAirportPOIs(categories = []) {
    await this.initialize();

    // 카테고리 매핑 (DB 카테고리 → 선택된 카테고리)
    const dbCategoryMap = {
      'shopping': ['Fashion', 'Beauty', 'Beverage', 'Snack', 'Duty_free'],
      'food': ['Meal', 'Cafe', 'Dessert'],
      'relax': ['Lounge', 'Rest', 'Hotel'],
      'culture': ['Attraction'],
      'entertainment': ['Entertainment'],
      'services': ['Lounge', 'Rest', 'Hotel'] // 편의시설로도 포함
    };

    // 선택된 카테고리에 해당하는 DB 카테고리들
    const dbCategories = [];
    if (categories.length > 0) {
      categories.forEach(category => {
        if (dbCategoryMap[category]) {
          dbCategories.push(...dbCategoryMap[category]);
        }
      });
    }

    let sql = `
      SELECT 
        rest_name as name,
        type as category,
        location,
        information as description,
        business_hours,
        phone_number,
        blog as website,
        cost,
        image_url,
        'rests_db_frame' as table_name
      FROM rests_db_frame 
      WHERE layover_airport_id = 'SIN'
    `;

    if (dbCategories.length > 0) {
      const categoryPlaceholders = dbCategories.map(() => '?').join(',');
      sql += ` AND type IN (${categoryPlaceholders})`;
    }

    sql += `
      UNION ALL
      SELECT 
        event_name as name,
        type as category,
        location,
        information as description,
        business_hours,
        NULL as phone_number,
        reservation_url as website,
        cost,
        image_url,
        'airport_events_db_frame' as table_name
      FROM airport_events_db_frame 
      WHERE layover_airport_id = 'SIN'
    `;

    if (dbCategories.length > 0) {
      const categoryPlaceholders = dbCategories.map(() => '?').join(',');
      sql += ` AND type IN (${categoryPlaceholders})`;
    }

    sql += `
      UNION ALL
      SELECT 
        meal_name as name,
        type as category,
        location,
        information as description,
        business_hours,
        phone_number,
        blog as website,
        cost,
        image_url,
        'meal_options_db_frame' as table_name
      FROM meal_options_db_frame 
      WHERE layover_airport_id = 'SIN'
    `;

    if (dbCategories.length > 0) {
      const categoryPlaceholders = dbCategories.map(() => '?').join(',');
      sql += ` AND type IN (${categoryPlaceholders})`;
    }

    sql += `
      UNION ALL
      SELECT 
        shopping_options_name as name,
        type as category,
        location,
        information as description,
        business_hours,
        phone_number,
        blog as website,
        cost,
        image_url,
        'shopping_options_db_frame' as table_name
      FROM shopping_options_db_frame 
      WHERE layover_airport_id = 'SIN'
    `;

    if (dbCategories.length > 0) {
      const categoryPlaceholders = dbCategories.map(() => '?').join(',');
      sql += ` AND type IN (${categoryPlaceholders})`;
    }

    try {
      // 각 UNION ALL에 대해 바인딩 파라미터를 반복 (3개의 UNION ALL)
      const params = [];
      for (let i = 0; i < 3; i++) {
        if (dbCategories.length > 0) {
          params.push(...dbCategories);
        }
      }

      const results = this.executeQueryAll(sql, params);
      
      // 결과를 표준화된 형태로 변환
      return results.map((row, index) => ({
        id: `${row.table_name}_${index}`,
        name: row.name || 'Unknown',
        category: this.mapCategory(row.category),
        categoryIcon: this.getCategoryIcon(this.mapCategory(row.category)),
        description: row.description || '',
        location: row.location || '',
        businessHours: row.business_hours || '',
        phoneNumber: row.phone_number || '',
        website: row.website || '',
        cost: row.cost || '',
        estimatedTime: this.getEstimatedTime(row.category),
        imageUrl: row.image_url || '',
        rating: 4.0 + Math.random(), // 임시 평점
        userRatingsTotal: Math.floor(Math.random() * 100) + 10 // 임시 리뷰 수
      }));

    } catch (error) {
      console.error('싱가포르 공항 POI 조회 실패:', error);
      return [];
    }
  }

  /**
   * 카테고리 매핑
   */
  mapCategory(dbCategory) {
    const categoryMap = {
      'Lounge': 'relax',
      'Rest': 'relax',
      'Hotel': 'relax',
      'Attraction': 'culture',
      'Meal': 'food',
      'Cafe': 'food',
      'Dessert': 'food',
      'Fashion': 'shopping',
      'Beauty': 'shopping',
      'Beverage': 'shopping',
      'Snack': 'shopping',
      'Duty_free': 'shopping',
      'Entertainment': 'entertainment'
    };
    
    return categoryMap[dbCategory] || 'services';
  }

  /**
   * 카테고리 아이콘 가져오기
   */
  getCategoryIcon(category) {
    const icons = {
      'relax': '💆',
      'culture': '🎨',
      'food': '🍽️',
      'shopping': '🛍️',
      'entertainment': '🎮',
      'services': '🏪'
    };
    
    return icons[category] || '📍';
  }

  /**
   * 카테고리별 예상 소요시간 계산
   */
  getEstimatedTime(category) {
    // 모든 장소 10분으로 통일
    return 10;
  }

  /**
   * 데이터베이스 연결 해제
   */
  close() {
    if (this.db) {
      this.db.close();
      this.db = null;
      this.isInitialized = false;
    }
  }
}

// 전역 인스턴스 생성
window.sqliteClient = new SQLiteClient();
