/**
 * Review Database Service
 * 하이브리드 방식: Supabase (우선) + SQLite/IndexedDB (백업/오프라인)
 */

import { getSupabase, getSupabaseUserId } from './supabaseClient.js';

class ReviewDB {
  constructor() {
    this.db = null;
    this.isInitialized = false;
    this.storageKey = 'viaflight_reviews_db'; // IndexedDB 키
    
    // Supabase 사용 여부 (환경 변수나 설정으로 제어 가능)
    this.useSupabase = true;
  }

  /**
   * SQLite 데이터베이스 초기화
   */
  async initialize() {
    if (this.isInitialized && this.db) {
      return;
    }

    try {
      // sql.js 라이브러리 로드 확인
      if (typeof SQL === 'undefined') {
        await this.loadSQLJS();
      }

      // IndexedDB에서 기존 데이터 로드 시도
      const savedData = await this.loadFromIndexedDB();
      
      if (savedData) {
        // 기존 데이터가 있으면 복원
        this.db = new SQL.Database(new Uint8Array(savedData));
        
        // 기존 DB에도 마이그레이션 실행
        await this.migrateTables();
      } else {
        // 새 데이터베이스 생성
        this.db = new SQL.Database();
        await this.createTables();
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
   * 기존 테이블 마이그레이션 (컬럼 추가 등)
   */
  async migrateTables() {
    if (!this.db) return;
    
    try {
      // user_id 컬럼이 있는지 확인 (prepare 방식 사용)
      const stmt = this.db.prepare(`
        SELECT sql FROM sqlite_master 
        WHERE type='table' AND name='trip_reviews'
      `);
      
      let tableSql = '';
      if (stmt.step()) {
        const result = stmt.getAsObject();
        tableSql = result.sql || '';
      }
      stmt.free();
      
      // user_id 컬럼이 없으면 추가
      if (tableSql && !tableSql.includes('user_id')) {
        this.db.run(`ALTER TABLE trip_reviews ADD COLUMN user_id TEXT`);
        await this.saveToIndexedDB();
      }
      
      // trip_info_visited_places 컬럼이 없으면 추가 (방문 장소 전체 리스트)
      if (tableSql && !tableSql.includes('trip_info_visited_places')) {
        this.db.run(`ALTER TABLE trip_reviews ADD COLUMN trip_info_visited_places TEXT`);
        await this.saveToIndexedDB();
      }
      
      // overall_review_image_url 컬럼이 없으면 추가
      if (tableSql && !tableSql.includes('overall_review_image_url')) {
        this.db.run(`ALTER TABLE trip_reviews ADD COLUMN overall_review_image_url TEXT`);
        await this.saveToIndexedDB();
      }
      
      // route_map_image_url 컬럼이 없으면 추가
      if (tableSql && !tableSql.includes('route_map_image_url')) {
        this.db.run(`ALTER TABLE trip_reviews ADD COLUMN route_map_image_url TEXT`);
        await this.saveToIndexedDB();
      }
      
      // place_reviews 테이블의 image_url 컬럼 확인
      const placeTableStmt = this.db.prepare(`
        SELECT sql FROM sqlite_master 
        WHERE type='table' AND name='place_reviews'
      `);
      
      let placeTableSql = '';
      if (placeTableStmt.step()) {
        const placeResult = placeTableStmt.getAsObject();
        placeTableSql = placeResult.sql || '';
      }
      placeTableStmt.free();
      
      // place_reviews 테이블의 image_url 컬럼이 없으면 추가
      if (placeTableSql && !placeTableSql.includes('image_url')) {
        this.db.run(`ALTER TABLE place_reviews ADD COLUMN image_url TEXT`);
        await this.saveToIndexedDB();
      }
      
      // review_likes 테이블이 존재하는지 확인
      const likesTableStmt = this.db.prepare(`
        SELECT name FROM sqlite_master 
        WHERE type='table' AND name='review_likes'
      `);
      
      let likesTableExists = false;
      if (likesTableStmt.step()) {
        likesTableExists = true;
      }
      likesTableStmt.free();
      
      // review_likes 테이블이 없으면 생성
      if (!likesTableExists) {
        this.db.run(`
          CREATE TABLE IF NOT EXISTS review_likes (
            id TEXT PRIMARY KEY,
            review_id TEXT NOT NULL,
            user_id TEXT,
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
        
        await this.saveToIndexedDB();
      }
    } catch (e) {
      // 컬럼이 이미 존재하거나 다른 오류
      if (e.message && (e.message.includes('duplicate column') || e.message.includes('no such column'))) {
        // duplicate column: 이미 존재함
        // no such column: 테이블이 없거나 다른 문제 (무시)
      } else {
        console.warn('마이그레이션 중 오류 (무시 가능):', e.message);
      }
    }
  }

  /**
   * 테이블 생성
   */
  async createTables() {
    // 전체 여정 리뷰 테이블
    this.db.run(`
      CREATE TABLE IF NOT EXISTS trip_reviews (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        overall_review_rating INTEGER NOT NULL,
        overall_review_summary TEXT,
        overall_review_detail TEXT,
        overall_review_image_url TEXT,
        trip_info_city TEXT NOT NULL,
        trip_info_duration INTEGER,
        trip_info_visit_count INTEGER,
        trip_info_trip_type TEXT,
        trip_info_arrival TEXT,
        trip_info_departure TEXT,
        trip_info_visited_places TEXT,
        route_map_image_url TEXT,
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
        image_url TEXT,
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
   * @param {Object} reviewData - 리뷰 데이터
   * @returns {Promise<string>} - 저장된 리뷰 ID
   */
  async saveTripReview(reviewData) {
    const now = new Date().toISOString();
    
    // 사용자 ID 가져오기 (Auth0 ID)
    const auth0UserId = reviewData.userId || (window.getUserId ? await window.getUserId() : null);
    if (!auth0UserId) {
      throw new Error('사용자 ID가 필요합니다. 로그인해주세요.');
    }

    // 1. Supabase에 저장 시도 (우선)
    if (this.useSupabase) {
      try {
        const supabase = await getSupabase();
        const supabaseUserId = await getSupabaseUserId(auth0UserId);
        
        // Supabase에 리뷰 저장
        // visited_places는 JSONB 타입이므로 객체를 직접 저장
        const { data, error } = await supabase
          .from('trip_reviews')
          .insert({
            user_id: supabaseUserId,
            city: reviewData.tripInfo.city,
            rating: reviewData.overallReview.rating,
            summary: reviewData.overallReview.summary || '',
            detail: reviewData.overallReview.detail || '',
            // 추가 여행 정보
            duration: reviewData.tripInfo.duration || null,
            visit_count: reviewData.tripInfo.visitCount || null,
            trip_type: reviewData.tripInfo.tripType || null,
            arrival: reviewData.tripInfo.arrival || null,
            departure: reviewData.tripInfo.departure || null,
            visited_places: reviewData.tripInfo.allVisitedPlaces || null,
            // 이미지 URL 추가
            overall_review_image_url: reviewData.overallReview.imageUrl || null,
            route_map_image_url: reviewData.routeMapImageUrl || null
          })
          .select('id')
          .single();

        if (error) throw error;

        const reviewId = data.id;
        
        // 장소별 리뷰 저장 (이미지 URL 포함)
        if (reviewData.placeReviews && reviewData.placeReviews.length > 0) {
          const placeReviewsData = reviewData.placeReviews.map(placeReview => ({
            trip_review_id: reviewId,
            poi_id: placeReview.poiId,
            poi_name: placeReview.poiName,
            poi_category: placeReview.poiCategory || '',
            poi_category_icon: placeReview.poiCategoryIcon || '',
            poi_location: placeReview.poiLocation || '',
            rating: placeReview.rating,
            comment: placeReview.comment || '',
            image_url: placeReview.imageUrl || null
          }));
          
          const { error: placeError } = await supabase
            .from('place_reviews')
            .insert(placeReviewsData);
          
          if (placeError) {
            console.warn('⚠️ 장소별 리뷰 저장 실패:', placeError);
          }
        }
        
        // IndexedDB에도 백업 저장 (오프라인 지원 및 기존 코드 호환성)
        await this.saveToIndexedDBFallback(reviewData, reviewId, auth0UserId, now);
        
        console.log('✅ 리뷰 저장 완료 (Supabase):', reviewId);
        return reviewId;
      } catch (error) {
        // Supabase 스키마 오류인 경우 더 명확한 메시지
        if (error.message && error.message.includes('column') && error.message.includes('schema cache')) {
          console.error('⚠️ Supabase 스키마 오류:', error.message);
          console.error('💡 해결 방법: supabase-schema-extension.sql 파일의 SQL을 Supabase SQL Editor에서 실행해주세요.');
        }
        console.warn('⚠️ Supabase 저장 실패, IndexedDB로 fallback:', error);
        // Supabase 실패 시 IndexedDB로 계속 진행
      }
    }

    // 2. IndexedDB에 저장 (fallback 또는 Supabase 비활성화 시)
    await this.initialize();
    const reviewId = `review_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // 전체 리뷰 저장
    const visitedPlacesJson = reviewData.tripInfo.allVisitedPlaces 
      ? JSON.stringify(reviewData.tripInfo.allVisitedPlaces) 
      : null;
    
    this.db.run(`
      INSERT INTO trip_reviews (
        id, user_id, overall_review_rating, overall_review_summary, overall_review_detail,
        overall_review_image_url, trip_info_city, trip_info_duration, trip_info_visit_count,
        trip_info_trip_type, trip_info_arrival, trip_info_departure,
        trip_info_visited_places, route_map_image_url, submitted_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      reviewId,
      auth0UserId,
      reviewData.overallReview.rating,
      reviewData.overallReview.summary || '',
      reviewData.overallReview.detail || '',
      reviewData.overallReview.imageUrl || null,
      reviewData.tripInfo.city,
      reviewData.tripInfo.duration,
      reviewData.tripInfo.visitCount,
      reviewData.tripInfo.tripType,
      reviewData.tripInfo.arrival,
      reviewData.tripInfo.departure,
      visitedPlacesJson,
      reviewData.routeMapImageUrl || null,
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
            poi_category_icon, poi_location, rating, comment, image_url, submitted_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
          placeReview.imageUrl || null,
          now
        ]);
      }
    }

    // 변경사항 저장
    await this.saveToIndexedDB();

    console.log('✅ 리뷰 저장 완료 (IndexedDB):', reviewId);
    return reviewId;
  }

  /**
   * IndexedDB에 리뷰 백업 저장 (내부 함수)
   */
  async saveToIndexedDBFallback(reviewData, reviewId, auth0UserId, now) {
    try {
      await this.initialize();
      
      // 전체 리뷰 저장
      const visitedPlacesJson = reviewData.tripInfo.allVisitedPlaces 
        ? JSON.stringify(reviewData.tripInfo.allVisitedPlaces) 
        : null;
      
      this.db.run(`
        INSERT OR REPLACE INTO trip_reviews (
          id, user_id, overall_review_rating, overall_review_summary, overall_review_detail,
          trip_info_city, trip_info_duration, trip_info_visit_count,
          trip_info_trip_type, trip_info_arrival, trip_info_departure,
          trip_info_visited_places, submitted_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        reviewId,
        auth0UserId,
        reviewData.overallReview.rating,
        reviewData.overallReview.summary || '',
        reviewData.overallReview.detail || '',
        reviewData.tripInfo.city,
        reviewData.tripInfo.duration,
        reviewData.tripInfo.visitCount,
        reviewData.tripInfo.tripType,
        reviewData.tripInfo.arrival,
        reviewData.tripInfo.departure,
        visitedPlacesJson,
        now,
        now
      ]);

      // 개별 장소 리뷰 저장
      if (reviewData.placeReviews && reviewData.placeReviews.length > 0) {
        for (const placeReview of reviewData.placeReviews) {
          const placeId = `place_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          
          this.db.run(`
            INSERT OR REPLACE INTO place_reviews (
              id, trip_review_id, poi_id, poi_name, poi_category,
              poi_category_icon, poi_location, rating, comment, image_url, submitted_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
            placeReview.imageUrl || null,
            now
          ]);
        }
      }

      await this.saveToIndexedDB();
    } catch (error) {
      console.warn('IndexedDB 백업 저장 실패:', error);
    }
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
   * @param {string} city - 도시 이름
   * @returns {Promise<Array>} - 리뷰 목록
   */
  async getCityReviews(city) {
    if (!city) {
      return [];
    }

    // 1. Supabase에서 조회 시도 (우선)
    if (this.useSupabase) {
      try {
        const supabase = await getSupabase();
        
        const { data, error } = await supabase
          .from('trip_reviews')
          .select('*')
          .eq('city', city)
          .order('created_at', { ascending: false });

        if (!error && data && data.length > 0) {
          // Supabase 데이터를 기존 형식으로 변환
          const reviews = await Promise.all(data.map(async (item) => {
            // userId 복원 (profiles 테이블에서 조회)
            let auth0UserId = null;
            try {
              const { data: profile } = await supabase
                .from('profiles')
                .select('auth0_id')
                .eq('id', item.user_id)
                .single();
              
              if (profile) {
                auth0UserId = profile.auth0_id;
              }
            } catch (e) {
              console.warn('userId 복원 실패:', e);
            }

            // 방문 장소 정보 처리 (JSONB는 객체로 반환됨)
            let visitedPlaces = null;
            if (item.visited_places) {
              visitedPlaces = typeof item.visited_places === 'string'
                ? item.visited_places
                : JSON.stringify(item.visited_places);
            }

            return {
              id: item.id,
              user_id: auth0UserId,
              overall_review_rating: item.rating,
              overall_review_summary: item.summary || '',
              overall_review_detail: item.detail || '',
              trip_info_city: item.city,
              trip_info_duration: item.duration || null,
              trip_info_visit_count: item.visit_count || null,
              trip_info_trip_type: item.trip_type || null,
              trip_info_arrival: item.arrival || null,
              trip_info_departure: item.departure || null,
              trip_info_visited_places: visitedPlaces,
              submitted_at: item.created_at
            };
          }));

          // IndexedDB에도 동기화 (백업)
          await this.syncReviewsToIndexedDB(reviews);
          
          return reviews;
        }
      } catch (error) {
        console.warn('⚠️ Supabase 조회 실패, IndexedDB로 fallback:', error);
        // Supabase 실패 시 IndexedDB로 계속 진행
      }
    }

    // 2. IndexedDB에서 조회 (fallback)
    await this.initialize();
    
    if (!this.isInitialized || !this.db) {
      throw new Error('데이터베이스가 초기화되지 않았습니다.');
    }

    const stmt = this.db.prepare(`
      SELECT 
        id,
        user_id,
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
   * Supabase 리뷰를 IndexedDB에 동기화 (내부 함수)
   */
  async syncReviewsToIndexedDB(reviews) {
    try {
      await this.initialize();
      if (!this.db) return;

      // 기존 리뷰 삭제 후 새로 저장 (간단한 동기화)
      for (const review of reviews) {
        this.db.run(`
          INSERT OR REPLACE INTO trip_reviews (
            id, user_id, overall_review_rating, overall_review_summary, overall_review_detail,
            trip_info_city, trip_info_duration, trip_info_visit_count,
            trip_info_trip_type, trip_info_arrival, trip_info_departure,
            trip_info_visited_places, submitted_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          review.id,
          review.user_id,
          review.overall_review_rating,
          review.overall_review_summary,
          review.overall_review_detail,
          review.trip_info_city,
          review.trip_info_duration,
          review.trip_info_visit_count,
          review.trip_info_trip_type,
          null, // arrival
          null, // departure
          review.trip_info_visited_places || null,
          review.submitted_at,
          review.submitted_at
        ]);
      }

      await this.saveToIndexedDB();
    } catch (error) {
      console.warn('IndexedDB 동기화 실패:', error);
    }
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
   * @param {string} reviewId - 리뷰 ID (Supabase UUID 또는 IndexedDB reviewId)
   * @returns {Promise<Object|null>} - 리뷰 데이터
   */
  async getTripReviewById(reviewId) {
    if (!reviewId) {
      return null;
    }

    // 1. Supabase에서 조회 시도 (UUID 형식인 경우)
    if (this.useSupabase && reviewId.includes('-')) { // UUID 형식 체크
      try {
        const supabase = await getSupabase();
        const { data, error } = await supabase
          .from('trip_reviews')
          .select('*')
          .eq('id', reviewId)
          .single();

        if (!error && data) {
          // userId 복원
          let auth0UserId = null;
          try {
            const { data: profile } = await supabase
              .from('profiles')
              .select('auth0_id')
              .eq('id', data.user_id)
              .single();
            
            if (profile) {
              auth0UserId = profile.auth0_id;
            }
          } catch (e) {
            console.warn('userId 복원 실패:', e);
          }

          // Supabase 데이터를 기존 형식으로 변환
          // visited_places는 JSONB 타입이므로 객체로 반환됨
          let visitedPlaces = null;
          if (data.visited_places) {
            // JSONB는 이미 객체이므로 문자열로 변환 (IndexedDB 호환성)
            visitedPlaces = typeof data.visited_places === 'string' 
              ? data.visited_places 
              : JSON.stringify(data.visited_places);
          }
          
          return {
            id: data.id,
            user_id: auth0UserId,
            overall_review_rating: data.rating,
            overall_review_summary: data.summary || '',
            overall_review_detail: data.detail || '',
            overall_review_image_url: data.overall_review_image_url || null,
            trip_info_city: data.city,
            trip_info_duration: data.duration || null,
            trip_info_visit_count: data.visit_count || null,
            trip_info_trip_type: data.trip_type || null,
            trip_info_arrival: data.arrival || null,
            trip_info_departure: data.departure || null,
            trip_info_visited_places: visitedPlaces,
            route_map_image_url: data.route_map_image_url || null,
            submitted_at: data.created_at
          };
        }
      } catch (error) {
        console.warn('⚠️ Supabase 조회 실패, IndexedDB로 fallback:', error);
      }
    }

    // 2. IndexedDB에서 조회 (fallback)
    await this.initialize();
    
    if (!this.isInitialized || !this.db) {
      throw new Error('데이터베이스가 초기화되지 않았습니다.');
    }

    const stmt = this.db.prepare(`
      SELECT 
        id,
        user_id,
        overall_review_rating,
        overall_review_summary,
        overall_review_detail,
        overall_review_image_url,
        trip_info_city,
        trip_info_duration,
        trip_info_visit_count,
        trip_info_trip_type,
        trip_info_arrival,
        trip_info_departure,
        trip_info_visited_places,
        route_map_image_url,
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
   * @param {string} tripReviewId - 여정 리뷰 ID (Supabase UUID 또는 IndexedDB reviewId)
   * @returns {Promise<Array>} - 장소 리뷰 배열
   */
  async getPlaceReviewsByTripId(tripReviewId) {
    if (!tripReviewId) {
      return [];
    }

    // 1. Supabase에서 조회 시도 (UUID 형식인 경우)
    if (this.useSupabase && tripReviewId.includes('-')) {
      try {
        const supabase = await getSupabase();
        const { data, error } = await supabase
          .from('place_reviews')
          .select('*')
          .eq('trip_review_id', tripReviewId)
          .order('submitted_at', { ascending: true });

        if (!error && data) {
          // Supabase 데이터를 기존 형식으로 변환
          const results = data.map(item => ({
            id: item.id,
            poi_id: item.poi_id,
            poi_name: item.poi_name,
            poi_category: item.poi_category || '',
            poi_category_icon: item.poi_category_icon || '',
            poi_location: item.poi_location || '',
            rating: item.rating,
            comment: item.comment || '',
            image_url: item.image_url || null,
            submitted_at: item.submitted_at
          }));
          console.log(`✅ 장소 리뷰 조회 완료 (Supabase): ${results.length}개`);
          return results;
        }
      } catch (error) {
        console.warn('⚠️ Supabase 장소 리뷰 조회 실패, IndexedDB로 fallback:', error);
      }
    }

    // 2. IndexedDB에서 조회 (fallback)
    await this.initialize();
    
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
        image_url,
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
      const request = indexedDB.open('ViaFlightStorage', 3);

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
        // user_profiles store도 확인
        if (!db.objectStoreNames.contains('user_profiles')) {
          db.createObjectStore('user_profiles', { keyPath: 'userId' });
        }
        // user_schedules store도 확인
        if (!db.objectStoreNames.contains('user_schedules')) {
          const store = db.createObjectStore('user_schedules', { keyPath: 'scheduleId' });
          store.createIndex('userId', 'userId', { unique: false });
          store.createIndex('createdAt', 'createdAt', { unique: false });
        }
      };
    });
  }

  /**
   * IndexedDB에서 데이터베이스 로드
   */
  async loadFromIndexedDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('ViaFlightStorage', 3);

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
        // user_profiles store도 확인
        if (!db.objectStoreNames.contains('user_profiles')) {
          db.createObjectStore('user_profiles', { keyPath: 'userId' });
        }
        // user_schedules store도 확인
        if (!db.objectStoreNames.contains('user_schedules')) {
          const store = db.createObjectStore('user_schedules', { keyPath: 'scheduleId' });
          store.createIndex('userId', 'userId', { unique: false });
          store.createIndex('createdAt', 'createdAt', { unique: false });
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
   * 리뷰 데이터베이스 초기화 (모든 데이터 삭제)
   * @returns {Promise<void>}
   */
  async clearDatabase() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('ViaFlightStorage', 3);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const transaction = db.transaction(['databases'], 'readwrite');
        const store = transaction.objectStore('databases');
        
        // 리뷰 DB 삭제
        const deleteRequest = store.delete(this.storageKey);
        
        deleteRequest.onsuccess = () => {
          console.log('✅ 리뷰 DB IndexedDB에서 삭제 완료');
          
          // 메모리의 DB도 초기화
          if (this.db) {
            this.db.close();
            this.db = null;
          }
          this.isInitialized = false;
          
          // 새 DB 생성
          this.initialize().then(() => {
            console.log('✅ 리뷰 DB 초기화 완료 (새 DB 생성됨)');
            resolve();
          }).catch(reject);
        };
        
        deleteRequest.onerror = () => reject(deleteRequest.error);
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
   * 좋아요 개수 조회
   * @param {string} reviewId - 리뷰 ID
   * @returns {Promise<number>} - 좋아요 개수
   */
  async getLikeCount(reviewId) {
    if (!reviewId) {
      return 0;
    }

    // 1. Supabase에서 조회 시도 (UUID 형식인 경우)
    if (this.useSupabase && reviewId.includes('-')) { // UUID 형식 체크
      try {
        const supabase = await getSupabase();
        const { count, error } = await supabase
          .from('review_likes')
          .select('*', { count: 'exact', head: true })
          .eq('review_id', reviewId);

        if (!error && count !== null) {
          return count;
        }
      } catch (error) {
        console.warn('⚠️ Supabase 좋아요 개수 조회 실패, IndexedDB로 fallback:', error);
      }
    }

    // 2. IndexedDB에서 조회 (fallback)
    await this.initialize();
    
    if (!this.db) {
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
   * 리뷰의 좋아요 목록 가져오기
   * @param {string} reviewId - 리뷰 ID
   * @returns {Promise<Array>} - 좋아요 목록
   */
  async getLikesByReviewId(reviewId) {
    if (!reviewId) {
      return [];
    }

    // 1. Supabase에서 조회 시도 (UUID 형식인 경우)
    if (this.useSupabase && reviewId.includes('-')) { // UUID 형식 체크
      try {
        const supabase = await getSupabase();
        const { data, error } = await supabase
          .from('review_likes')
          .select('*')
          .eq('review_id', reviewId);

        if (!error && data) {
          // Supabase 데이터를 기존 형식으로 변환
          const likes = await Promise.all(data.map(async (item) => {
            // userId 복원 (profiles 테이블에서 조회)
            let auth0UserId = null;
            try {
              const { data: profile } = await supabase
                .from('profiles')
                .select('auth0_id')
                .eq('id', item.user_id)
                .single();
              
              if (profile) {
                auth0UserId = profile.auth0_id;
              }
            } catch (e) {
              console.warn('userId 복원 실패:', e);
            }

            return {
              id: item.id,
              review_id: item.review_id,
              user_id: auth0UserId,
              liked_at: item.created_at
            };
          }));

          return likes;
        }
      } catch (error) {
        console.warn('⚠️ Supabase 좋아요 목록 조회 실패, IndexedDB로 fallback:', error);
      }
    }

    // 2. IndexedDB에서 조회 (fallback)
    await this.initialize();
    
    if (!this.db) {
      return [];
    }
    
    try {
      const stmt = this.db.prepare(`
        SELECT * FROM review_likes 
        WHERE review_id = ?
      `);
      stmt.bind([reviewId]);
      
      const results = [];
      while (stmt.step()) {
        results.push(stmt.getAsObject());
      }
      stmt.free();
      
      return results;
    } catch (e) {
      console.error('좋아요 목록 조회 실패:', e);
      return [];
    }
  }

  /**
   * 좋아요 추가
   * @param {string} reviewId - 리뷰 ID
   * @param {string} userId - 사용자 ID (Auth0 ID)
   * @returns {Promise<string>} - 좋아요 ID
   */
  async addLike(reviewId, userId = null) {
    if (!reviewId) {
      throw new Error('리뷰 ID가 필요합니다.');
    }

    // 사용자 ID 가져오기 (Auth0 ID)
    const auth0UserId = userId || (window.getUserId ? await window.getUserId() : null);
    if (!auth0UserId) {
      throw new Error('사용자 ID가 필요합니다. 로그인해주세요.');
    }

    // 1. Supabase에 저장 시도 (UUID 형식인 경우)
    if (this.useSupabase && reviewId.includes('-')) { // UUID 형식 체크
      try {
        const supabase = await getSupabase();
        const supabaseUserId = await getSupabaseUserId(auth0UserId);
        
        const { data, error } = await supabase
          .from('review_likes')
          .insert({
            review_id: reviewId,
            user_id: supabaseUserId
          })
          .select('id')
          .single();

        if (error) {
          // 중복 좋아요 에러는 무시 (이미 좋아요를 누른 경우)
          if (error.code === '23505') { // unique_violation
            console.warn('이미 좋아요를 누른 리뷰입니다.');
            return null;
          }
          throw error;
        }

        const likeId = data.id;
        
        // IndexedDB에도 백업 저장
        await this.addLikeToIndexedDB(reviewId, auth0UserId, likeId);
        
        return likeId;
      } catch (error) {
        console.warn('⚠️ Supabase 좋아요 추가 실패, IndexedDB로 fallback:', error);
        // Supabase 실패 시 IndexedDB로 계속 진행
      }
    }

    // 2. IndexedDB에 저장 (fallback)
    await this.initialize();
    
    const likeId = `like_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const now = new Date().toISOString();
    
    this.db.run(`
      INSERT INTO review_likes (id, review_id, user_id, liked_at)
      VALUES (?, ?, ?, ?)
    `, [likeId, reviewId, auth0UserId, now]);
    
    await this.saveToIndexedDB();
    return likeId;
  }

  /**
   * IndexedDB에 좋아요 백업 저장 (내부 함수)
   */
  async addLikeToIndexedDB(reviewId, auth0UserId, likeId) {
    try {
      await this.initialize();
      if (!this.db) return;

      const now = new Date().toISOString();
      this.db.run(`
        INSERT OR REPLACE INTO review_likes (id, review_id, user_id, liked_at)
        VALUES (?, ?, ?, ?)
      `, [likeId, reviewId, auth0UserId, now]);
      
      await this.saveToIndexedDB();
    } catch (error) {
      console.warn('IndexedDB 좋아요 백업 저장 실패:', error);
    }
  }

  /**
   * 좋아요 삭제
   * @param {string} reviewId - 리뷰 ID
   * @param {string} userId - 사용자 ID (Auth0 ID)
   * @returns {Promise<void>}
   */
  async removeLike(reviewId, userId = null) {
    if (!reviewId) {
      throw new Error('리뷰 ID가 필요합니다.');
    }

    // 사용자 ID 가져오기 (Auth0 ID)
    const auth0UserId = userId || (window.getUserId ? await window.getUserId() : null);
    if (!auth0UserId) {
      throw new Error('사용자 ID가 필요합니다. 로그인해주세요.');
    }

    // 1. Supabase에서 삭제 시도 (UUID 형식인 경우)
    if (this.useSupabase && reviewId.includes('-')) { // UUID 형식 체크
      try {
        const supabase = await getSupabase();
        const supabaseUserId = await getSupabaseUserId(auth0UserId);
        
        const { error } = await supabase
          .from('review_likes')
          .delete()
          .eq('review_id', reviewId)
          .eq('user_id', supabaseUserId);

        if (error) throw error;
        
        // IndexedDB에서도 삭제
        await this.removeLikeFromIndexedDB(reviewId, auth0UserId);
        
        return;
      } catch (error) {
        console.warn('⚠️ Supabase 좋아요 삭제 실패, IndexedDB로 fallback:', error);
        // Supabase 실패 시 IndexedDB로 계속 진행
      }
    }

    // 2. IndexedDB에서 삭제 (fallback)
    await this.initialize();
    
    if (auth0UserId) {
      this.db.run(`
        DELETE FROM review_likes 
        WHERE review_id = ? AND user_id = ?
      `, [reviewId, auth0UserId]);
    }
    
    await this.saveToIndexedDB();
  }

  /**
   * IndexedDB에서 좋아요 삭제 (내부 함수)
   */
  async removeLikeFromIndexedDB(reviewId, auth0UserId) {
    try {
      await this.initialize();
      if (!this.db) return;

      this.db.run(`
        DELETE FROM review_likes 
        WHERE review_id = ? AND user_id = ?
      `, [reviewId, auth0UserId]);
      
      await this.saveToIndexedDB();
    } catch (error) {
      console.warn('IndexedDB 좋아요 삭제 실패:', error);
    }
  }

  /**
   * 리뷰 삭제
   * @param {string} reviewId - 리뷰 ID
   * @param {string} userId - 사용자 ID (Auth0 ID) - 본인 확인용
   * @returns {Promise<void>}
   */
  async deleteTripReview(reviewId, userId = null) {
    if (!reviewId) {
      throw new Error('리뷰 ID가 필요합니다.');
    }

    // 사용자 ID 가져오기 (Auth0 ID)
    const auth0UserId = userId || (window.getUserId ? await window.getUserId() : null);
    if (!auth0UserId) {
      throw new Error('사용자 ID가 필요합니다. 로그인해주세요.');
    }

    // 1. Supabase에서 삭제 시도 (UUID 형식인 경우)
    if (this.useSupabase && reviewId.includes('-')) { // UUID 형식 체크
      try {
        const supabase = await getSupabase();
        const supabaseUserId = await getSupabaseUserId(auth0UserId);
        
        // 본인 리뷰인지 확인
        const { data: review, error: fetchError } = await supabase
          .from('trip_reviews')
          .select('user_id')
          .eq('id', reviewId)
          .single();
        
        if (fetchError) throw fetchError;
        if (!review) {
          throw new Error('리뷰를 찾을 수 없습니다.');
        }
        if (review.user_id !== supabaseUserId) {
          throw new Error('본인의 리뷰만 삭제할 수 있습니다.');
        }
        
        // 관련 좋아요도 삭제
        await supabase
          .from('review_likes')
          .delete()
          .eq('review_id', reviewId);
        
        // 리뷰 삭제
        const { error } = await supabase
          .from('trip_reviews')
          .delete()
          .eq('id', reviewId);
        
        if (error) throw error;
        
        // IndexedDB에서도 삭제
        await this.deleteFromIndexedDB(reviewId);
        
        console.log('✅ 리뷰 삭제 완료 (Supabase):', reviewId);
        return;
      } catch (error) {
        console.warn('⚠️ Supabase 리뷰 삭제 실패, IndexedDB로 fallback:', error);
        // Supabase 실패 시 IndexedDB로 계속 진행
      }
    }

    // 2. IndexedDB에서 삭제 (fallback)
    await this.initialize();
    
    if (!this.isInitialized || !this.db) {
      throw new Error('데이터베이스가 초기화되지 않았습니다.');
    }
    
    // 본인 리뷰인지 확인
    const review = await this.getTripReviewById(reviewId);
    if (!review) {
      throw new Error('리뷰를 찾을 수 없습니다.');
    }
    if (review.user_id !== auth0UserId) {
      throw new Error('본인의 리뷰만 삭제할 수 있습니다.');
    }
    
    // 관련 좋아요 삭제
    this.db.run(`DELETE FROM review_likes WHERE review_id = ?`, [reviewId]);
    
    // 장소 리뷰 삭제
    this.db.run(`DELETE FROM place_reviews WHERE trip_review_id = ?`, [reviewId]);
    
    // 리뷰 삭제
    this.db.run(`DELETE FROM trip_reviews WHERE id = ?`, [reviewId]);
    
    await this.saveToIndexedDB();
    
    console.log('✅ 리뷰 삭제 완료 (IndexedDB):', reviewId);
  }

  /**
   * IndexedDB에서 리뷰 삭제 (내부 함수)
   */
  async deleteFromIndexedDB(reviewId) {
    try {
      await this.initialize();
      if (!this.db) return;

      // 관련 좋아요 삭제
      this.db.run(`DELETE FROM review_likes WHERE review_id = ?`, [reviewId]);
      
      // 장소 리뷰 삭제
      this.db.run(`DELETE FROM place_reviews WHERE trip_review_id = ?`, [reviewId]);
      
      // 리뷰 삭제
      this.db.run(`DELETE FROM trip_reviews WHERE id = ?`, [reviewId]);
      
      await this.saveToIndexedDB();
    } catch (error) {
      console.warn('IndexedDB 리뷰 삭제 실패:', error);
    }
  }

  /**
   * 사용자 ID로 작성한 리뷰 조회
   */
  async getReviewsByUserId(userId) {
    await this.initialize();
    
    if (!this.db || !userId) {
      return [];
    }
    
    try {
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
        WHERE user_id = ?
        ORDER BY submitted_at DESC
      `);
      
      stmt.bind([userId]);
      
      const results = [];
      while (stmt.step()) {
        results.push(stmt.getAsObject());
      }
      stmt.free();
      
      return results;
    } catch (e) {
      console.error('사용자 리뷰 조회 실패:', e);
      return [];
    }
  }

  /**
   * 사용자 ID로 좋아요한 리뷰 조회
   */
  async getLikedReviewsByUserId(userId) {
    await this.initialize();
    
    if (!this.db || !userId) {
      return [];
    }
    
    try {
      const stmt = this.db.prepare(`
        SELECT DISTINCT
          tr.id,
          tr.overall_review_rating,
          tr.overall_review_summary,
          tr.overall_review_detail,
          tr.trip_info_city,
          tr.trip_info_duration,
          tr.trip_info_visit_count,
          tr.trip_info_trip_type,
          tr.submitted_at
        FROM trip_reviews tr
        INNER JOIN review_likes rl ON tr.id = rl.review_id
        WHERE rl.user_id = ?
        ORDER BY rl.liked_at DESC
      `);
      
      stmt.bind([userId]);
      
      const results = [];
      while (stmt.step()) {
        results.push(stmt.getAsObject());
      }
      stmt.free();
      
      return results;
    } catch (e) {
      console.error('좋아요한 리뷰 조회 실패:', e);
      return [];
    }
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

// 전역 함수로 초기화 함수 노출
window.clearReviewDB = async function() {
  let shouldClear = false;
  
  if (window.showConfirmModal) {
    shouldClear = await showConfirmModal({
      message: '리뷰 데이터베이스를 초기화하시겠습니까?\n\n모든 리뷰 데이터가 삭제되며 되돌릴 수 없습니다.',
      title: '데이터베이스 초기화',
      type: 'danger',
      confirmText: '초기화',
      cancelText: '취소'
    });
  } else {
    shouldClear = confirm('리뷰 데이터베이스를 초기화하시겠습니까?\n\n모든 리뷰 데이터가 삭제되며 되돌릴 수 없습니다.');
  }
  
  if (shouldClear) {
    try {
      await window.reviewDB.clearDatabase();
      if (window.showModal) {
        showModal({
          message: '리뷰 데이터베이스가 초기화되었습니다.',
          type: 'success',
          onConfirm: () => {
            window.location.reload();
          }
        });
      } else {
        alert('✅ 리뷰 데이터베이스가 초기화되었습니다.');
        window.location.reload();
      }
    } catch (error) {
      console.error('리뷰 DB 초기화 실패:', error);
      if (window.showModal) {
        showModal({
          message: '리뷰 데이터베이스 초기화에 실패했습니다.',
          type: 'error'
        });
      } else {
        alert('❌ 리뷰 데이터베이스 초기화에 실패했습니다.');
      }
    }
  }
};

// 전역 함수로 리뷰 삭제 함수 노출
window.deleteTripReview = async function(reviewId, userId = null) {
  if (!window.reviewDB) {
    throw new Error('리뷰 DB가 초기화되지 않았습니다.');
  }
  return await window.reviewDB.deleteTripReview(reviewId, userId);
};


