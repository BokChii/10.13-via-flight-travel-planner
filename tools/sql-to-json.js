#!/usr/bin/env node

/**
 * SQL to JSON Converter
 * SQL 파일을 JSON 형태로 변환하여 클라이언트에서 사용할 수 있도록 합니다.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// SQL 파일 경로
const sqlFilePath = path.join(__dirname, '../data/data.sql');

// 출력 JSON 파일 경로
const jsonFilePath = path.join(__dirname, '../data/singapore-airport-data.json');

// 카테고리 매핑
const CATEGORY_MAPPING = {
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
  'Entertainment': 'entertainment',
  'FoodSpot': 'food',
  'paid_tour': 'entertainment',
  'free_tour': 'entertainment'
};

// 카테고리 아이콘 매핑
const CATEGORY_ICONS = {
  'relax': '💆',
  'culture': '🎨',
  'food': '🍽️',
  'shopping': '🛍️',
  'entertainment': '🎮',
  'services': '🏪'
};

/**
 * SQL INSERT 문을 파싱하여 데이터 추출
 */
function parseSQLInsert(sqlContent) {
  const data = {
    lounges: [],
    restaurants: [],
    hotels: [],
    attractions: [],
    meals: [],
    shopping: [],
    services: [],
    tours: []
  };

  // INSERT 문들을 찾아서 파싱
  const insertRegex = /INSERT INTO (\w+) \(([^)]+)\) VALUES \(([^)]+)\);/g;
  let match;

  while ((match = insertRegex.exec(sqlContent)) !== null) {
    const tableName = match[1];
    const columns = match[2].split(',').map(col => col.trim());
    const values = parseValues(match[3]);

    if (values.length > 0) {
      const record = {};
      columns.forEach((col, index) => {
        record[col] = values[index];
      });

      // 테이블별로 데이터 분류
      switch (tableName) {
        case 'rests_db_frame':
          if (record.type === 'Lounge' || record.type === 'Rest' || record.type === 'Hotel') {
            data.lounges.push(transformRestData(record));
          }
          break;
        case 'airport_events_db_frame':
          data.attractions.push(transformAttractionData(record));
          break;
        case 'meal_options_db_frame':
          data.meals.push(transformMealData(record));
          break;
        case 'shopping_options_db_frame':
          data.shopping.push(transformShoppingData(record));
          break;
        case 'food_spot_db_frame':
          data.restaurants.push(transformFoodSpotData(record));
          break;
        case 'paid_activity_db_frame':
          data.tours.push(transformPaidActivityData(record));
          break;
        case 'free_tour_db_frame':
          data.tours.push(transformFreeTourData(record));
          break;
      }
    }
  }

  return data;
}

/**
 * VALUES 부분을 파싱하여 배열로 변환
 */
function parseValues(valuesString) {
  const values = [];
  let current = '';
  let inQuotes = false;
  let quoteChar = '';

  for (let i = 0; i < valuesString.length; i++) {
    const char = valuesString[i];
    
    if (!inQuotes && (char === "'" || char === '"')) {
      inQuotes = true;
      quoteChar = char;
      current += char;
    } else if (inQuotes && char === quoteChar) {
      // 이스케이프된 따옴표인지 확인
      if (i + 1 < valuesString.length && valuesString[i + 1] === quoteChar) {
        current += char + char;
        i++; // 다음 따옴표 건너뛰기
      } else {
        inQuotes = false;
        quoteChar = '';
        current += char;
      }
    } else if (!inQuotes && char === ',') {
      values.push(cleanValue(current.trim()));
      current = '';
    } else {
      current += char;
    }
  }

  if (current.trim()) {
    values.push(cleanValue(current.trim()));
  }

  return values;
}

/**
 * 값 정리 (따옴표 제거, NULL 처리)
 */
function cleanValue(value) {
  value = value.trim();
  
  if (value === 'NULL') {
    return null;
  }
  
  if ((value.startsWith("'") && value.endsWith("'")) || 
      (value.startsWith('"') && value.endsWith('"'))) {
    return value.slice(1, -1);
  }
  
  return value;
}

/**
 * 휴식/라운지 데이터 변환
 */
function transformRestData(record) {
  return {
    id: `rest_${record.rest_name?.replace(/\s+/g, '_') || Math.random()}`,
    name: record.rest_name || 'Unknown',
    category: CATEGORY_MAPPING[record.type] || 'services',
    categoryIcon: CATEGORY_ICONS[CATEGORY_MAPPING[record.type]] || '📍',
    description: record.information || '',
    location: record.location || '',
    businessHours: record.business_hours || '',
    phoneNumber: record.phone_number || '',
    website: record.blog || '',
    cost: record.cost || '',
    estimatedTime: getEstimatedTime(record.type),
    imageUrl: record.image_url || '',
    rating: 4.0 + Math.random(), // 임시 평점
    userRatingsTotal: Math.floor(Math.random() * 100) + 10 // 임시 리뷰 수
  };
}

/**
 * 관광지 데이터 변환
 */
function transformAttractionData(record) {
  return {
    id: `attraction_${record.event_name?.replace(/\s+/g, '_') || Math.random()}`,
    name: record.event_name || 'Unknown',
    category: 'culture',
    categoryIcon: '🎨',
    description: record.information || '',
    location: record.location || '',
    businessHours: record.business_hours || '',
    cost: record.cost || '',
    estimatedTime: getEstimatedTime('Attraction'),
    imageUrl: record.image_url || '',
    rating: 4.0 + Math.random(),
    userRatingsTotal: Math.floor(Math.random() * 100) + 10
  };
}

/**
 * 식사 데이터 변환
 */
function transformMealData(record) {
  return {
    id: `meal_${record.meal_name?.replace(/\s+/g, '_') || Math.random()}`,
    name: record.meal_name || 'Unknown',
    category: CATEGORY_MAPPING[record.type] || 'food',
    categoryIcon: CATEGORY_ICONS[CATEGORY_MAPPING[record.type]] || '🍽️',
    description: record.information || '',
    location: record.location || '',
    businessHours: record.business_hours || '',
    phoneNumber: record.phone_number || '',
    website: record.blog || '',
    cost: record.cost || '',
    estimatedTime: getEstimatedTime(record.type),
    imageUrl: record.image_url || '',
    rating: 4.0 + Math.random(),
    userRatingsTotal: Math.floor(Math.random() * 100) + 10
  };
}

/**
 * 쇼핑 데이터 변환
 */
function transformShoppingData(record) {
  return {
    id: `shopping_${record.shopping_options_name?.replace(/\s+/g, '_') || Math.random()}`,
    name: record.shopping_options_name || 'Unknown',
    category: CATEGORY_MAPPING[record.type] || 'shopping',
    categoryIcon: CATEGORY_ICONS[CATEGORY_MAPPING[record.type]] || '🛍️',
    description: record.information || '',
    location: record.location || '',
    businessHours: record.business_hours || '',
    phoneNumber: record.phone_number || '',
    website: record.blog || '',
    cost: record.cost || '',
    estimatedTime: getEstimatedTime(record.type),
    imageUrl: record.image_url || '',
    rating: 4.0 + Math.random(),
    userRatingsTotal: Math.floor(Math.random() * 100) + 10
  };
}

/**
 * 음식점 데이터 변환
 */
function transformFoodSpotData(record) {
  return {
    id: `foodspot_${record.food_spot_name?.replace(/\s+/g, '_') || Math.random()}`,
    name: record.food_spot_name || 'Unknown',
    category: 'food',
    categoryIcon: '🍽️',
    description: record.information || '',
    businessHours: record.business_time || '',
    phoneNumber: record.phone_number || '',
    estimatedTime: getEstimatedTime('FoodSpot'),
    imageUrl: record.image_url || '',
    rating: 4.0 + Math.random(),
    userRatingsTotal: Math.floor(Math.random() * 100) + 10
  };
}

/**
 * 유료 활동 데이터 변환
 */
function transformPaidActivityData(record) {
  return {
    id: `paid_${record.paid_activity_name?.replace(/\s+/g, '_') || Math.random()}`,
    name: record.paid_activity_name || 'Unknown',
    category: 'entertainment',
    categoryIcon: '🎮',
    description: record.information || '',
    businessHours: record.business_time || '',
    cost: record.cost || '',
    website: record.homepage || '',
    estimatedTime: record.used_time ? record.used_time * 60 : getEstimatedTime('paid_tour'),
    imageUrl: record.image_url || '',
    rating: 4.0 + Math.random(),
    userRatingsTotal: Math.floor(Math.random() * 100) + 10
  };
}

/**
 * 무료 투어 데이터 변환
 */
function transformFreeTourData(record) {
  return {
    id: `free_${record.free_tour_name?.replace(/\s+/g, '_') || Math.random()}`,
    name: record.free_tour_name || 'Unknown',
    category: 'entertainment',
    categoryIcon: '🎮',
    description: record.information || '',
    route: record.route || '',
    businessHours: record.business_time || '',
    cost: record.cost || '무료',
    website: record.homepage || '',
    estimatedTime: parseTimeToMinutes(record.business_time),
    imageUrl: record.image_url || '',
    rating: 4.0 + Math.random(),
    userRatingsTotal: Math.floor(Math.random() * 100) + 10
  };
}

/**
 * 카테고리별 예상 소요시간 계산
 */
function getEstimatedTime(type) {
  const timeMap = {
    'Lounge': 120,
    'Rest': 60,
    'Hotel': 480,
    'Attraction': 45,
    'Meal': 60,
    'Cafe': 30,
    'Dessert': 20,
    'Fashion': 90,
    'Beauty': 60,
    'Beverage': 30,
    'Snack': 15,
    'Duty_free': 45,
    'Entertainment': 60,
    'FoodSpot': 45,
    'paid_tour': 180,
    'free_tour': 150
  };
  
  return timeMap[type] || 30;
}

/**
 * 시간 문자열을 분으로 변환
 */
function parseTimeToMinutes(timeString) {
  if (!timeString) return 30;
  
  const match = timeString.match(/(\d+)h?\s*(\d+)?\s*min?/i);
  if (match) {
    const hours = parseInt(match[1]) || 0;
    const minutes = parseInt(match[2]) || 0;
    return hours * 60 + minutes;
  }
  
  return 30;
}

/**
 * 메인 실행 함수
 */
function main() {
  try {
    console.log('SQL 파일을 JSON으로 변환 중...');
    
    // SQL 파일 읽기
    if (!fs.existsSync(sqlFilePath)) {
      throw new Error(`SQL 파일을 찾을 수 없습니다: ${sqlFilePath}`);
    }
    
    const sqlContent = fs.readFileSync(sqlFilePath, 'utf8');
    console.log('SQL 파일 읽기 완료');
    
    // 데이터 파싱
    const data = parseSQLInsert(sqlContent);
    console.log('데이터 파싱 완료');
    
    // 통계 출력
    console.log('\n변환된 데이터 통계:');
    Object.keys(data).forEach(key => {
      console.log(`  ${key}: ${data[key].length}개`);
    });
    
    // JSON 파일로 저장
    fs.writeFileSync(jsonFilePath, JSON.stringify(data, null, 2), 'utf8');
    console.log(`\nJSON 파일 생성 완료: ${jsonFilePath}`);
    
    // 메타데이터 추가
    const metadata = {
      generatedAt: new Date().toISOString(),
      sourceFile: 'data.sql',
      totalRecords: Object.values(data).reduce((sum, arr) => sum + arr.length, 0),
      categories: Object.keys(data)
    };
    
    const finalData = {
      metadata,
      data
    };
    
    fs.writeFileSync(jsonFilePath, JSON.stringify(finalData, null, 2), 'utf8');
    console.log('메타데이터 추가 완료');
    
  } catch (error) {
    console.error('변환 중 오류 발생:', error.message);
    process.exit(1);
  }
}

// 스크립트 실행
console.log('스크립트 시작...');
console.log('import.meta.url:', import.meta.url);
console.log('process.argv[1]:', process.argv[1]);

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('메인 함수 실행...');
  main();
} else {
  console.log('메인 함수 실행 조건 불만족');
}

export { parseSQLInsert, transformRestData, transformAttractionData };
