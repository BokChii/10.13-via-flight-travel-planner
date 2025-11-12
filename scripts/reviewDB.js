/**
 * Review Database Service
 * SQLite 기반 리뷰 데이터 저장 서비스
 * 기존 sqliteClient.js와 동일한 방식으로 구현
 */

class ReviewDB {
  constructor() {
    this.db = null;
    this.isInitialized = false;
    this.storageKey = 'viaflight_reviews_db'; // IndexedDB 키
  }

  /**
   * SQLite 데이터베이스 초기화
   */
  async initialize() {
    if (this.isInitialized && this.db) {
      return;
    }

    try {
      console.log('리뷰 DB 초기화 시작...');
      
      // sql.js 라이브러리 로드 확인
      if (typeof SQL === 'undefined') {
        await this.loadSQLJS();
      }

      // IndexedDB에서 기존 데이터 로드 시도
      const savedData = await this.loadFromIndexedDB();
      
      if (savedData) {
        // 기존 데이터가 있으면 복원
        this.db = new SQL.Database(new Uint8Array(savedData));
        console.log('✅ 기존 리뷰 DB 복원 완료');
      } else {
        // 새 데이터베이스 생성
        this.db = new SQL.Database();
        await this.createTables();
        console.log('✅ 새 리뷰 DB 생성 완료');
      }

      this.isInitialized = true;

    } catch (error) {
      console.error('리뷰 DB 초기화 실패:', error);
      throw error;
    }
  }

  /**
   * sql.js 라이브러리 로드 (기존 sqliteClient와 동일)
   */
  async loadSQLJS() {
    if (typeof SQL !== 'undefined') {
      return;
    }

    // 기존 sqliteClient가 이미 로드했을 수 있으므로 확인
    if (window.SQL) {
      return;
    }

    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.8.0/sql-wasm.js';
      script.onload = async () => {
        try {
          const initSqlJs = window.initSqlJs;
          if (!initSqlJs) {
            throw new Error('initSqlJs 함수를 찾을 수 없습니다');
          }

          const SQL = await initSqlJs({
            locateFile: file => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.8.0/${file}`
          });

          window.SQL = SQL;
          resolve();
        } catch (error) {
          reject(error);
        }
      };
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  /**
   * 테이블 생성
   */
  async createTables() {
    // 전체 여정 리뷰 테이블
    this.db.run(`
      CREATE TABLE IF NOT EXISTS trip_reviews (
        id TEXT PRIMARY KEY,
        overall_review_rating INTEGER NOT NULL,
        overall_review_summary TEXT,
        overall_review_detail TEXT,
        trip_info_city TEXT NOT NULL,
        trip_info_duration INTEGER,
        trip_info_visit_count INTEGER,
        trip_info_trip_type TEXT,
        trip_info_arrival TEXT,
        trip_info_departure TEXT,
        submitted_at TEXT NOT NULL,
        updated_at TEXT
      )
    `);

    // 개별 장소 리뷰 테이블
    this.db.run(`
      CREATE TABLE IF NOT EXISTS place_reviews (
        id TEXT PRIMARY KEY,
        trip_review_id TEXT NOT NULL,
        poi_id TEXT NOT NULL,
        poi_name TEXT NOT NULL,
        poi_category TEXT,
        poi_category_icon TEXT,
        poi_location TEXT,
        rating INTEGER NOT NULL,
        comment TEXT,
        submitted_at TEXT NOT NULL,
        FOREIGN KEY (trip_review_id) REFERENCES trip_reviews(id) ON DELETE CASCADE
      )
    `);

    // 인덱스 생성
    this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_place_reviews_poi_id 
      ON place_reviews(poi_id)
    `);

    this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_place_reviews_trip_review_id 
      ON place_reviews(trip_review_id)
    `);

    this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_trip_reviews_city 
      ON trip_reviews(trip_info_city)
    `);

    this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_trip_reviews_submitted_at 
      ON trip_reviews(submitted_at)
    `);

    // 좋아요 테이블 (로그인 기능 추가 전 대비)
    this.db.run(`
      CREATE TABLE IF NOT EXISTS review_likes (
        id TEXT PRIMARY KEY,
        review_id TEXT NOT NULL,
        user_id TEXT, -- 로그인 기능 추가 전에는 NULL 가능
        liked_at TEXT NOT NULL,
        FOREIGN KEY (review_id) REFERENCES trip_reviews(id) ON DELETE CASCADE
      )
    `);

    this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_review_likes_review_id 
      ON review_likes(review_id)
    `);

    this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_review_likes_user_id 
      ON review_likes(user_id)
    `);

    // 변경사항 저장
    await this.saveToIndexedDB();
  }

  /**
   * 전체 여정 리뷰 저장
   */
  async saveTripReview(reviewData) {
    await this.initialize();

    const reviewId = `review_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const now = new Date().toISOString();

    // 전체 리뷰 저장
    this.db.run(`
      INSERT INTO trip_reviews (
        id, overall_review_rating, overall_review_summary, overall_review_detail,
        trip_info_city, trip_info_duration, trip_info_visit_count,
        trip_info_trip_type, trip_info_arrival, trip_info_departure,
        submitted_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      reviewId,
      reviewData.overallReview.rating,
      reviewData.overallReview.summary || '',
      reviewData.overallReview.detail || '',
      reviewData.tripInfo.city,
      reviewData.tripInfo.duration,
      reviewData.tripInfo.visitCount,
      reviewData.tripInfo.tripType,
      reviewData.tripInfo.arrival,
      reviewData.tripInfo.departure,
      now,
      now
    ]);

    // 개별 장소 리뷰 저장
    if (reviewData.placeReviews && reviewData.placeReviews.length > 0) {
      for (const placeReview of reviewData.placeReviews) {
        const placeId = `place_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        this.db.run(`
          INSERT INTO place_reviews (
            id, trip_review_id, poi_id, poi_name, poi_category,
            poi_category_icon, poi_location, rating, comment, submitted_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          placeId,
          reviewId,
          placeReview.poiId,
          placeReview.poiName,
          placeReview.poiCategory || '',
          placeReview.poiCategoryIcon || '',
          placeReview.poiLocation || '',
          placeReview.rating,
          placeReview.comment || '',
          now
        ]);
      }
    }

    // 변경사항 저장
    await this.saveToIndexedDB();

    console.log('✅ 리뷰 저장 완료:', reviewId);
    return reviewId;
  }

  /**
   * 특정 POI의 모든 리뷰 조회
   */
  getPlaceReviews(poiId) {
    if (!this.isInitialized || !this.db) {
      throw new Error('데이터베이스가 초기화되지 않았습니다.');
    }

    const stmt = this.db.prepare(`
      SELECT 
        pr.id,
        pr.poi_id,
        pr.poi_name,
        pr.rating,
        pr.comment,
        pr.submitted_at,
        tr.trip_info_city,
        tr.trip_info_trip_type
      FROM place_reviews pr
      JOIN trip_reviews tr ON pr.trip_review_id = tr.id
      WHERE pr.poi_id = ?
      ORDER BY pr.submitted_at DESC
    `);

    // 파라미터 바인딩
    stmt.bind([poiId]);

    const results = [];
    while (stmt.step()) {
      results.push(stmt.getAsObject());
    }
    stmt.free();

    return results;
  }

  /**
   * 도시별 전체 리뷰 조회
   */
  getCityReviews(city) {
    if (!this.isInitialized || !this.db) {
      throw new Error('데이터베이스가 초기화되지 않았습니다.');
    }

    const stmt = this.db.prepare(`
      SELECT 
        id,
        overall_review_rating,
        overall_review_summary,
        overall_review_detail,
        trip_info_city,
        trip_info_duration,
        trip_info_visit_count,
        trip_info_trip_type,
        submitted_at
      FROM trip_reviews
      WHERE trip_info_city = ?
      ORDER BY submitted_at DESC
    `);

    // 파라미터 바인딩
    stmt.bind([city]);

    const results = [];
    while (stmt.step()) {
      results.push(stmt.getAsObject());
    }
    stmt.free();

    return results;
  }

  /**
   * POI별 평균 평점 조회
   */
  getPlaceAverageRating(poiId) {
    if (!this.isInitialized || !this.db) {
      throw new Error('데이터베이스가 초기화되지 않았습니다.');
    }

    const stmt = this.db.prepare(`
      SELECT 
        AVG(rating) as avg_rating,
        COUNT(*) as review_count
      FROM place_reviews
      WHERE poi_id = ?
    `);

    // 파라미터 바인딩
    stmt.bind([poiId]);

    // step()을 호출하여 결과를 가져옴
    if (stmt.step()) {
      const result = stmt.getAsObject();
      stmt.free();
      return {
        averageRating: result.avg_rating ? parseFloat(result.avg_rating.toFixed(1)) : 0,
        reviewCount: result.review_count || 0
      };
    } else {
      stmt.free();
      return {
        averageRating: 0,
        reviewCount: 0
      };
    }
  }

  /**
   * 특정 리뷰 ID로 전체 리뷰 조회
   */
  getTripReviewById(reviewId) {
    if (!this.isInitialized || !this.db) {
      throw new Error('데이터베이스가 초기화되지 않았습니다.');
    }

    const stmt = this.db.prepare(`
      SELECT 
        id,
        overall_review_rating,
        overall_review_summary,
        overall_review_detail,
        trip_info_city,
        trip_info_duration,
        trip_info_visit_count,
        trip_info_trip_type,
        trip_info_arrival,
        trip_info_departure,
        submitted_at
      FROM trip_reviews
      WHERE id = ?
    `);

    // 파라미터 바인딩
    stmt.bind([reviewId]);

    // step()을 호출하여 결과를 가져옴
    if (stmt.step()) {
      const result = stmt.getAsObject();
      stmt.free();
      return result;
    } else {
      stmt.free();
      return null;
    }
  }

  /**
   * 특정 여정 리뷰의 모든 장소 리뷰 조회
   */
  getPlaceReviewsByTripId(tripReviewId) {
    if (!this.isInitialized || !this.db) {
      throw new Error('데이터베이스가 초기화되지 않았습니다.');
    }

    const stmt = this.db.prepare(`
      SELECT 
        id,
        poi_id,
        poi_name,
        poi_category,
        poi_category_icon,
        poi_location,
        rating,
        comment,
        submitted_at
      FROM place_reviews
      WHERE trip_review_id = ?
      ORDER BY submitted_at ASC
    `);

    // 파라미터 바인딩
    stmt.bind([tripReviewId]);

    const results = [];
    while (stmt.step()) {
      results.push(stmt.getAsObject());
    }
    stmt.free();

    return results;
  }

  /**
   * IndexedDB에 데이터베이스 저장
   */
  async saveToIndexedDB() {
    if (!this.db) return;

    const data = this.db.export();
    const buffer = new Uint8Array(data);

    return new Promise((resolve, reject) => {
      const request = indexedDB.open('ViaFlightStorage', 1);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const transaction = db.transaction(['databases'], 'readwrite');
        const store = transaction.objectStore('databases');
        
        const putRequest = store.put(buffer, this.storageKey);
        putRequest.onsuccess = () => {
          console.log('✅ 리뷰 DB IndexedDB 저장 완료');
          resolve();
        };
        putRequest.onerror = () => reject(putRequest.error);
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains('databases')) {
          db.createObjectStore('databases');
        }
      };
    });
  }

  /**
   * IndexedDB에서 데이터베이스 로드
   */
  async loadFromIndexedDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('ViaFlightStorage', 1);

      request.onerror = () => resolve(null); // 오류 시 null 반환 (새 DB 생성)
      request.onsuccess = () => {
        const db = request.result;
        const transaction = db.transaction(['databases'], 'readonly');
        const store = transaction.objectStore('databases');
        const getRequest = store.get(this.storageKey);

        getRequest.onsuccess = () => {
          resolve(getRequest.result || null);
        };
        getRequest.onerror = () => resolve(null);
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains('databases')) {
          db.createObjectStore('databases');
        }
      };
    });
  }

  /**
   * 데이터베이스를 파일로 다운로드
   */
  downloadDatabase() {
    if (!this.db) {
      throw new Error('데이터베이스가 초기화되지 않았습니다.');
    }

    const data = this.db.export();
    const blob = new Blob([data], { type: 'application/x-sqlite3' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `viaflight_reviews_${new Date().toISOString().split('T')[0]}.db`;
    a.click();
    
    URL.revokeObjectURL(url);
    console.log('✅ 리뷰 DB 다운로드 완료');
  }

  /**
   * 데이터베이스 통계 조회
   */
  getStats() {
    if (!this.isInitialized || !this.db) {
      throw new Error('데이터베이스가 초기화되지 않았습니다.');
    }

    // 전체 리뷰 수
    const tripCountResult = this.db.exec(`
      SELECT COUNT(*) as count FROM trip_reviews
    `);
    const tripCount = tripCountResult.length > 0 && tripCountResult[0].values.length > 0
      ? tripCountResult[0].values[0][0] : 0;

    // 전체 장소 리뷰 수
    const placeCountResult = this.db.exec(`
      SELECT COUNT(*) as count FROM place_reviews
    `);
    const placeCount = placeCountResult.length > 0 && placeCountResult[0].values.length > 0
      ? placeCountResult[0].values[0][0] : 0;

    // 평균 평점
    const avgResult = this.db.exec(`
      SELECT AVG(overall_review_rating) as avg FROM trip_reviews
    `);
    const avgRating = avgResult.length > 0 && avgResult[0].values.length > 0
      ? avgResult[0].values[0][0] : 0;

    return {
      totalTripReviews: tripCount,
      totalPlaceReviews: placeCount,
      averageRating: avgRating ? parseFloat(avgRating.toFixed(1)) : 0
    };
  }

  /**
   * 좋아요 개수 조회 (DB에서)
   * 로그인 기능 추가 후 사용
   */
  getLikeCount(reviewId) {
    if (!this.isInitialized || !this.db) {
      return 0;
    }
    
    try {
      const stmt = this.db.prepare(`
        SELECT COUNT(*) as count 
        FROM review_likes 
        WHERE review_id = ?
      `);
      stmt.bind([reviewId]);
      stmt.step();
      const result = stmt.getAsObject();
      stmt.free();
      return result.count || 0;
    } catch (e) {
      console.error('좋아요 개수 조회 실패:', e);
      return 0;
    }
  }

  /**
   * 좋아요 추가 (로그인 기능 추가 후 사용)
   */
  async addLike(reviewId, userId = null) {
    await this.initialize();
    
    // auth.js에서 사용자 ID 가져오기 (전역 함수 사용)
    const currentUserId = userId || (window.getUserId ? await window.getUserId() : null);
    
    const likeId = `like_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const now = new Date().toISOString();
    
    this.db.run(`
      INSERT INTO review_likes (id, review_id, user_id, liked_at)
      VALUES (?, ?, ?, ?)
    `, [likeId, reviewId, currentUserId, now]);
    
    await this.saveToIndexedDB();
    return likeId;
  }

  /**
   * 좋아요 삭제 (로그인 기능 추가 후 사용)
   */
  async removeLike(reviewId, userId = null) {
    await this.initialize();
    
    // auth.js에서 사용자 ID 가져오기 (전역 함수 사용)
    const currentUserId = userId || (window.getUserId ? await window.getUserId() : null);
    
    if (currentUserId) {
      this.db.run(`
        DELETE FROM review_likes 
        WHERE review_id = ? AND user_id = ?
      `, [reviewId, currentUserId]);
    }
    
    await this.saveToIndexedDB();
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
window.reviewDB = new ReviewDB();


