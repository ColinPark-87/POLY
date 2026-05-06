-- =====================================================
-- 중계폴리 초기 데이터 (하원관리 SEED 기반)
-- 주의: campuses 테이블에 중계폴리가 있어야 합니다
-- =====================================================

DO $$
DECLARE
  v_campus_id UUID;
  v_sess_id   UUID;
  v_cls_id    UUID;
  v_stu_id    UUID;
BEGIN

  SELECT id INTO v_campus_id FROM campuses WHERE name LIKE '%중계%' LIMIT 1;
  IF v_campus_id IS NULL THEN
    RAISE EXCEPTION '캠퍼스를 찾을 수 없습니다. 목록: %', (SELECT string_agg(name, ', ') FROM campuses);
  END IF;

  -- 차량
  INSERT INTO campus_buses(campus_id,name,sort_order) VALUES(v_campus_id,'1호차',0) ON CONFLICT(campus_id,name) DO NOTHING;
  INSERT INTO campus_buses(campus_id,name,sort_order) VALUES(v_campus_id,'2호차',1) ON CONFLICT(campus_id,name) DO NOTHING;
  INSERT INTO campus_buses(campus_id,name,sort_order) VALUES(v_campus_id,'3호차',2) ON CONFLICT(campus_id,name) DO NOTHING;
  INSERT INTO campus_buses(campus_id,name,sort_order) VALUES(v_campus_id,'5호차',3) ON CONFLICT(campus_id,name) DO NOTHING;
  INSERT INTO campus_buses(campus_id,name,sort_order) VALUES(v_campus_id,'6호차',4) ON CONFLICT(campus_id,name) DO NOTHING;
  INSERT INTO campus_buses(campus_id,name,sort_order) VALUES(v_campus_id,'7호차',5) ON CONFLICT(campus_id,name) DO NOTHING;
  INSERT INTO campus_buses(campus_id,name,sort_order) VALUES(v_campus_id,'8호차',6) ON CONFLICT(campus_id,name) DO NOTHING;
  INSERT INTO campus_buses(campus_id,name,sort_order) VALUES(v_campus_id,'마미버스',7) ON CONFLICT(campus_id,name) DO NOTHING;
  INSERT INTO campus_buses(campus_id,name,sort_order) VALUES(v_campus_id,'결석',8) ON CONFLICT(campus_id,name) DO NOTHING;

  -- 학생 등록 (215명)
  INSERT INTO campus_students(campus_id,name,english_name,grade) VALUES(v_campus_id,'김도현','Peter Kim','초등부') ON CONFLICT DO NOTHING;
  INSERT INTO campus_students(campus_id,name,english_name,grade) VALUES(v_campus_id,'박세인','Sarah Park','초등부') ON CONFLICT DO NOTHING;
  INSERT INTO campus_students(campus_id,name,english_name,grade) VALUES(v_campus_id,'홍시연','Selena Hong','초등부') ON CONFLICT DO NOTHING;
  INSERT INTO campus_students(campus_id,name,english_name,grade) VALUES(v_campus_id,'하이진','Ha I Jin','초등부') ON CONFLICT DO NOTHING;
  INSERT INTO campus_students(campus_id,name,english_name,grade) VALUES(v_campus_id,'장인우','Jake Jang','초등부') ON CONFLICT DO NOTHING;
  INSERT INTO campus_students(campus_id,name,english_name,grade) VALUES(v_campus_id,'김태유','TaeYu Kim','초등부') ON CONFLICT DO NOTHING;
  INSERT INTO campus_students(campus_id,name,english_name,grade) VALUES(v_campus_id,'송다온','Daon Song','초등부') ON CONFLICT DO NOTHING;
  INSERT INTO campus_students(campus_id,name,english_name,grade) VALUES(v_campus_id,'박리환','Henry Park','초등부') ON CONFLICT DO NOTHING;
  INSERT INTO campus_students(campus_id,name,english_name,grade) VALUES(v_campus_id,'서성재','Leo Seo','초등부') ON CONFLICT DO NOTHING;
  INSERT INTO campus_students(campus_id,name,english_name,grade) VALUES(v_campus_id,'정다라윤','Darayoon Chung','초등부') ON CONFLICT DO NOTHING;
  INSERT INTO campus_students(campus_id,name,english_name,grade) VALUES(v_campus_id,'최수빈','Soobin Choi','초등부') ON CONFLICT DO NOTHING;
  INSERT INTO campus_students(campus_id,name,english_name,grade) VALUES(v_campus_id,'유건우','Leo Yu','초등부') ON CONFLICT DO NOTHING;
  INSERT INTO campus_students(campus_id,name,english_name,grade) VALUES(v_campus_id,'홍지안','Jian Hong','초등부') ON CONFLICT DO NOTHING;
  INSERT INTO campus_students(campus_id,name,english_name,grade) VALUES(v_campus_id,'이샤론','Sharon Lee','초등부') ON CONFLICT DO NOTHING;
  INSERT INTO campus_students(campus_id,name,english_name,grade) VALUES(v_campus_id,'오나윤','Sally Oh','초등부') ON CONFLICT DO NOTHING;
  INSERT INTO campus_students(campus_id,name,english_name,grade) VALUES(v_campus_id,'오나연','Anna Oh','초등부') ON CONFLICT DO NOTHING;
  INSERT INTO campus_students(campus_id,name,english_name,grade) VALUES(v_campus_id,'이승호','Seungho Lee','초등부') ON CONFLICT DO NOTHING;
  INSERT INTO campus_students(campus_id,name,english_name,grade) VALUES(v_campus_id,'임아리','Ari Lim','초등부') ON CONFLICT DO NOTHING;
  INSERT INTO campus_students(campus_id,name,english_name,grade) VALUES(v_campus_id,'박주안','John Park','초등부') ON CONFLICT DO NOTHING;
  INSERT INTO campus_students(campus_id,name,english_name,grade) VALUES(v_campus_id,'구이현','Noah Ku','초등부') ON CONFLICT DO NOTHING;
  INSERT INTO campus_students(campus_id,name,english_name,grade) VALUES(v_campus_id,'이로이','Roy Lee','초등부') ON CONFLICT DO NOTHING;
  INSERT INTO campus_students(campus_id,name,english_name,grade) VALUES(v_campus_id,'한서율','Ellie Han','초등부') ON CONFLICT DO NOTHING;
  INSERT INTO campus_students(campus_id,name,english_name,grade) VALUES(v_campus_id,'김이안','Mia Kim','초등부') ON CONFLICT DO NOTHING;
  INSERT INTO campus_students(campus_id,name,english_name,grade) VALUES(v_campus_id,'강민정','M.J Kang','초등부') ON CONFLICT DO NOTHING;
  INSERT INTO campus_students(campus_id,name,english_name,grade) VALUES(v_campus_id,'김민결','Eden Kim','초등부') ON CONFLICT DO NOTHING;
  INSERT INTO campus_students(campus_id,name,english_name,grade) VALUES(v_campus_id,'백주원','Spidey Baek','초등부') ON CONFLICT DO NOTHING;
  INSERT INTO campus_students(campus_id,name,english_name,grade) VALUES(v_campus_id,'김채아','Ella Kim','초등부') ON CONFLICT DO NOTHING;
  INSERT INTO campus_students(campus_id,name,english_name,grade) VALUES(v_campus_id,'임지후','Jenny Lim','초등부') ON CONFLICT DO NOTHING;
  INSERT INTO campus_students(campus_id,name,english_name,grade) VALUES(v_campus_id,'민채은','Joy Min','초등부') ON CONFLICT DO NOTHING;
  INSERT INTO campus_students(campus_id,name,english_name,grade) VALUES(v_campus_id,'김하윤','Elsa Kim','초등부') ON CONFLICT DO NOTHING;
  INSERT INTO campus_students(campus_id,name,english_name,grade) VALUES(v_campus_id,'박주희','Julie Park','초등부') ON CONFLICT DO NOTHING;
  INSERT INTO campus_students(campus_id,name,english_name,grade) VALUES(v_campus_id,'정리하','Riha Jeong','초등부') ON CONFLICT DO NOTHING;
  INSERT INTO campus_students(campus_id,name,english_name,grade) VALUES(v_campus_id,'유재준','Jake Yoo','초등부') ON CONFLICT DO NOTHING;
  INSERT INTO campus_students(campus_id,name,english_name,grade) VALUES(v_campus_id,'안시온','Zion Ahn','초등부') ON CONFLICT DO NOTHING;
  INSERT INTO campus_students(campus_id,name,english_name,grade) VALUES(v_campus_id,'이도겸','Ethan Lee','초등부') ON CONFLICT DO NOTHING;
  INSERT INTO campus_students(campus_id,name,english_name,grade) VALUES(v_campus_id,'이세연','Elisa Lee','초등부') ON CONFLICT DO NOTHING;
  INSERT INTO campus_students(campus_id,name,english_name,grade) VALUES(v_campus_id,'유설아',NULL,'초등부') ON CONFLICT DO NOTHING;
  INSERT INTO campus_students(campus_id,name,english_name,grade) VALUES(v_campus_id,'이승원','Julian Lee','초등부') ON CONFLICT DO NOTHING;
  INSERT INTO campus_students(campus_id,name,english_name,grade) VALUES(v_campus_id,'윤슬아','Masha Yoon','초등부') ON CONFLICT DO NOTHING;
  INSERT INTO campus_students(campus_id,name,english_name,grade) VALUES(v_campus_id,'곽수현','Sean Kwak','초등부') ON CONFLICT DO NOTHING;
  INSERT INTO campus_students(campus_id,name,english_name,grade) VALUES(v_campus_id,'문예준','Joshua Moon','초등부') ON CONFLICT DO NOTHING;
  INSERT INTO campus_students(campus_id,name,english_name,grade) VALUES(v_campus_id,'곽지훈','Jack Kwak','초등부') ON CONFLICT DO NOTHING;
  INSERT INTO campus_students(campus_id,name,english_name,grade) VALUES(v_campus_id,'이선예','Ellie Lee','초등부') ON CONFLICT DO NOTHING;
  INSERT INTO campus_students(campus_id,name,english_name,grade) VALUES(v_campus_id,'최정원','Ethan Choi','초등부') ON CONFLICT DO NOTHING;
  INSERT INTO campus_students(campus_id,name,english_name,grade) VALUES(v_campus_id,'김민채','Starry Kim','초등부') ON CONFLICT DO NOTHING;
  INSERT INTO campus_students(campus_id,name,english_name,grade) VALUES(v_campus_id,'문선우','Alex Moon','초등부') ON CONFLICT DO NOTHING;
  INSERT INTO campus_students(campus_id,name,english_name,grade) VALUES(v_campus_id,'문채윤','Sophia Moon','초등부') ON CONFLICT DO NOTHING;
  INSERT INTO campus_students(campus_id,name,english_name,grade) VALUES(v_campus_id,'임재희','Romi Im','초등부') ON CONFLICT DO NOTHING;
  INSERT INTO campus_students(campus_id,name,english_name,grade) VALUES(v_campus_id,'서지민','Jimin Seo','초등부') ON CONFLICT DO NOTHING;
  INSERT INTO campus_students(campus_id,name,english_name,grade) VALUES(v_campus_id,'김조이','Joy Kim','초등부') ON CONFLICT DO NOTHING;
  INSERT INTO campus_students(campus_id,name,english_name,grade) VALUES(v_campus_id,'김리현','Alex Kim','초등부') ON CONFLICT DO NOTHING;
  INSERT INTO campus_students(campus_id,name,english_name,grade) VALUES(v_campus_id,'차혜윰','Celine Cha','초등부') ON CONFLICT DO NOTHING;
  INSERT INTO campus_students(campus_id,name,english_name,grade) VALUES(v_campus_id,'주선호','Bobbie Joo','초등부') ON CONFLICT DO NOTHING;
  INSERT INTO campus_students(campus_id,name,english_name,grade) VALUES(v_campus_id,'김태인','Chloe Kim','초등부') ON CONFLICT DO NOTHING;
  INSERT INTO campus_students(campus_id,name,english_name,grade) VALUES(v_campus_id,'박정우','Eli Park','초등부') ON CONFLICT DO NOTHING;
  INSERT INTO campus_students(campus_id,name,english_name,grade) VALUES(v_campus_id,'서아인','Ain Seo','초등부') ON CONFLICT DO NOTHING;
  INSERT INTO campus_students(campus_id,name,english_name,grade) VALUES(v_campus_id,'최시아','Sia Choi','초등부') ON CONFLICT DO NOTHING;
  INSERT INTO campus_students(campus_id,name,english_name,grade) VALUES(v_campus_id,'위아인','Ain Wi','초등부') ON CONFLICT DO NOTHING;
  INSERT INTO campus_students(campus_id,name,english_name,grade) VALUES(v_campus_id,'유서연','Violet Yu','초등부') ON CONFLICT DO NOTHING;
  INSERT INTO campus_students(campus_id,name,english_name,grade) VALUES(v_campus_id,'박연서','Ella Park','초등부') ON CONFLICT DO NOTHING;
  INSERT INTO campus_students(campus_id,name,english_name,grade) VALUES(v_campus_id,'정근서','Alvin Jeong','초등부') ON CONFLICT DO NOTHING;
  INSERT INTO campus_students(campus_id,name,english_name,grade) VALUES(v_campus_id,'김예원','Chloe Kim','초등부') ON CONFLICT DO NOTHING;
  INSERT INTO campus_students(campus_id,name,english_name,grade) VALUES(v_campus_id,'이유주','Yuju Lee','초등부') ON CONFLICT DO NOTHING;
  INSERT INTO campus_students(campus_id,name,english_name,grade) VALUES(v_campus_id,'이지오','Jio Lee','초등부') ON CONFLICT DO NOTHING;
  INSERT INTO campus_students(campus_id,name,english_name,grade) VALUES(v_campus_id,'윤서진','Daisy Yoon','초등부') ON CONFLICT DO NOTHING;
  INSERT INTO campus_students(campus_id,name,english_name,grade) VALUES(v_campus_id,'최윤후','Celine Choi','초등부') ON CONFLICT DO NOTHING;
  INSERT INTO campus_students(campus_id,name,english_name,grade) VALUES(v_campus_id,'김주아','Stella Kim','초등부') ON CONFLICT DO NOTHING;
  INSERT INTO campus_students(campus_id,name,english_name,grade) VALUES(v_campus_id,'이로원','Raphael Lee','초등부') ON CONFLICT DO NOTHING;
  INSERT INTO campus_students(campus_id,name,english_name,grade) VALUES(v_campus_id,'장주호','Joshua Jang','초등부') ON CONFLICT DO NOTHING;
  INSERT INTO campus_students(campus_id,name,english_name,grade) VALUES(v_campus_id,'황도훈','Do-hoon Hwang','초등부') ON CONFLICT DO NOTHING;
  INSERT INTO campus_students(campus_id,name,english_name,grade) VALUES(v_campus_id,'이지율','Mia Lee','초등부') ON CONFLICT DO NOTHING;
  INSERT INTO campus_students(campus_id,name,english_name,grade) VALUES(v_campus_id,'진은우','Jace Jin','초등부') ON CONFLICT DO NOTHING;
  INSERT INTO campus_students(campus_id,name,english_name,grade) VALUES(v_campus_id,'최윤아','Elena Choi','초등부') ON CONFLICT DO NOTHING;
  INSERT INTO campus_students(campus_id,name,english_name,grade) VALUES(v_campus_id,'김재이','Bell Kim','초등부') ON CONFLICT DO NOTHING;
  INSERT INTO campus_students(campus_id,name,english_name,grade) VALUES(v_campus_id,'신민경','Olivia Sin','초등부') ON CONFLICT DO NOTHING;
  INSERT INTO campus_students(campus_id,name,english_name,grade) VALUES(v_campus_id,'서아민','Amin Seo','초등부') ON CONFLICT DO NOTHING;
  INSERT INTO campus_students(campus_id,name,english_name,grade) VALUES(v_campus_id,'최서준','Roy Choi','초등부') ON CONFLICT DO NOTHING;
  INSERT INTO campus_students(campus_id,name,english_name,grade) VALUES(v_campus_id,'김태준','Taejun Kim','초등부') ON CONFLICT DO NOTHING;
  INSERT INTO campus_students(campus_id,name,english_name,grade) VALUES(v_campus_id,'조이준','Roy Jo','초등부') ON CONFLICT DO NOTHING;
  INSERT INTO campus_students(campus_id,name,english_name,grade) VALUES(v_campus_id,'김도준','Dojune Kim','초등부') ON CONFLICT DO NOTHING;
  INSERT INTO campus_students(campus_id,name,english_name,grade) VALUES(v_campus_id,'박재의','Jay Park','초등부') ON CONFLICT DO NOTHING;
  INSERT INTO campus_students(campus_id,name,english_name,grade) VALUES(v_campus_id,'조윤성','Julian Jo','초등부') ON CONFLICT DO NOTHING;
  INSERT INTO campus_students(campus_id,name,english_name,grade) VALUES(v_campus_id,'전여진','Yeojin Jeon','초등부') ON CONFLICT DO NOTHING;
  INSERT INTO campus_students(campus_id,name,english_name,grade) VALUES(v_campus_id,'박시우','(Noah Park','초등부') ON CONFLICT DO NOTHING;
  INSERT INTO campus_students(campus_id,name,english_name,grade) VALUES(v_campus_id,'정윤우','Aiden Jeong','초등부') ON CONFLICT DO NOTHING;
  INSERT INTO campus_students(campus_id,name,english_name,grade) VALUES(v_campus_id,'손동후','Sam Son','초등부') ON CONFLICT DO NOTHING;
  INSERT INTO campus_students(campus_id,name,english_name,grade) VALUES(v_campus_id,'위서준','Aiden Wi','초등부') ON CONFLICT DO NOTHING;
  INSERT INTO campus_students(campus_id,name,english_name,grade) VALUES(v_campus_id,'윤찬서','John Yoon','초등부') ON CONFLICT DO NOTHING;
  INSERT INTO campus_students(campus_id,name,english_name,grade) VALUES(v_campus_id,'홍유나','Yuna Hong','초등부') ON CONFLICT DO NOTHING;
  INSERT INTO campus_students(campus_id,name,english_name,grade) VALUES(v_campus_id,'김서윤','Stella Kim','초등부') ON CONFLICT DO NOTHING;
  INSERT INTO campus_students(campus_id,name,english_name,grade) VALUES(v_campus_id,'최이섭','Jayden Choi','초등부') ON CONFLICT DO NOTHING;
  INSERT INTO campus_students(campus_id,name,english_name,grade) VALUES(v_campus_id,'김시현','Daniel Kim','초등부') ON CONFLICT DO NOTHING;
  INSERT INTO campus_students(campus_id,name,english_name,grade) VALUES(v_campus_id,'이윤설','Amy Lee','초등부') ON CONFLICT DO NOTHING;
  INSERT INTO campus_students(campus_id,name,english_name,grade) VALUES(v_campus_id,'박이준','Jun Park','초등부') ON CONFLICT DO NOTHING;
  INSERT INTO campus_students(campus_id,name,english_name,grade) VALUES(v_campus_id,'이예나','Jenny Lee','초등부') ON CONFLICT DO NOTHING;
  INSERT INTO campus_students(campus_id,name,english_name,grade) VALUES(v_campus_id,'유하진','Alex Yoo','초등부') ON CONFLICT DO NOTHING;
  INSERT INTO campus_students(campus_id,name,english_name,grade) VALUES(v_campus_id,'최우혁','Rio Choi','초등부') ON CONFLICT DO NOTHING;
  INSERT INTO campus_students(campus_id,name,english_name,grade) VALUES(v_campus_id,'조아인','Alice Jo','초등부') ON CONFLICT DO NOTHING;
  INSERT INTO campus_students(campus_id,name,english_name,grade) VALUES(v_campus_id,'유지호','Alex Yoo','초등부') ON CONFLICT DO NOTHING;
  INSERT INTO campus_students(campus_id,name,english_name,grade) VALUES(v_campus_id,'심서아','Lucy Sim','초등부') ON CONFLICT DO NOTHING;
  INSERT INTO campus_students(campus_id,name,english_name,grade) VALUES(v_campus_id,'이윤우','Yunwoo Lee','초등부') ON CONFLICT DO NOTHING;
  INSERT INTO campus_students(campus_id,name,english_name,grade) VALUES(v_campus_id,'홍한온','정발','초등부') ON CONFLICT DO NOTHING;
  INSERT INTO campus_students(campus_id,name,english_name,grade) VALUES(v_campus_id,'홍연재','Stella Hong','초등부') ON CONFLICT DO NOTHING;
  INSERT INTO campus_students(campus_id,name,english_name,grade) VALUES(v_campus_id,'최세영','Joy Choi','초등부') ON CONFLICT DO NOTHING;
  INSERT INTO campus_students(campus_id,name,english_name,grade) VALUES(v_campus_id,'염하준','Nico Yeom','초등부') ON CONFLICT DO NOTHING;
  INSERT INTO campus_students(campus_id,name,english_name,grade) VALUES(v_campus_id,'정세희','Lily Jeong','초등부') ON CONFLICT DO NOTHING;
  INSERT INTO campus_students(campus_id,name,english_name,grade) VALUES(v_campus_id,'권도희','Dohee Gwon','초등부') ON CONFLICT DO NOTHING;
  INSERT INTO campus_students(campus_id,name,english_name,grade) VALUES(v_campus_id,'강혜린','Erin Kang','초등부') ON CONFLICT DO NOTHING;
  INSERT INTO campus_students(campus_id,name,english_name,grade) VALUES(v_campus_id,'박서연','Jessica Park','초등부') ON CONFLICT DO NOTHING;
  INSERT INTO campus_students(campus_id,name,english_name,grade) VALUES(v_campus_id,'최수현','Alex choi','초등부') ON CONFLICT DO NOTHING;
  INSERT INTO campus_students(campus_id,name,english_name,grade) VALUES(v_campus_id,'정현준','Mason Jeong','초등부') ON CONFLICT DO NOTHING;
  INSERT INTO campus_students(campus_id,name,english_name,grade) VALUES(v_campus_id,'오유','Ayla Oh','초등부') ON CONFLICT DO NOTHING;
  INSERT INTO campus_students(campus_id,name,english_name,grade) VALUES(v_campus_id,'김도윤','Daniel Kim','초등부') ON CONFLICT DO NOTHING;
  INSERT INTO campus_students(campus_id,name,english_name,grade) VALUES(v_campus_id,'김로운','Roun Kim','초등부') ON CONFLICT DO NOTHING;
  INSERT INTO campus_students(campus_id,name,english_name,grade) VALUES(v_campus_id,'권하진','Jenna Gwon','초등부') ON CONFLICT DO NOTHING;
  INSERT INTO campus_students(campus_id,name,english_name,grade) VALUES(v_campus_id,'성연제','Chloe Sung','초등부') ON CONFLICT DO NOTHING;
  INSERT INTO campus_students(campus_id,name,english_name,grade) VALUES(v_campus_id,'오주안','Juan Oh','초등부') ON CONFLICT DO NOTHING;
  INSERT INTO campus_students(campus_id,name,english_name,grade) VALUES(v_campus_id,'박하윤','Mint Park','초등부') ON CONFLICT DO NOTHING;
  INSERT INTO campus_students(campus_id,name,english_name,grade) VALUES(v_campus_id,'윤서훈','Roy Yun','초등부') ON CONFLICT DO NOTHING;
  INSERT INTO campus_students(campus_id,name,english_name,grade) VALUES(v_campus_id,'김도아','Dorothy Kim','초등부') ON CONFLICT DO NOTHING;
  INSERT INTO campus_students(campus_id,name,english_name,grade) VALUES(v_campus_id,'윤채원','Crystal Yoon','초등부') ON CONFLICT DO NOTHING;
  INSERT INTO campus_students(campus_id,name,english_name,grade) VALUES(v_campus_id,'진유준','Leo Jin','초등부') ON CONFLICT DO NOTHING;
  INSERT INTO campus_students(campus_id,name,english_name,grade) VALUES(v_campus_id,'안재현 신규','Jayden Ahn','초등부') ON CONFLICT DO NOTHING;
  INSERT INTO campus_students(campus_id,name,english_name,grade) VALUES(v_campus_id,'박수아','Elena park','초등부') ON CONFLICT DO NOTHING;
  INSERT INTO campus_students(campus_id,name,english_name,grade) VALUES(v_campus_id,'고준','Liam Go','초등부') ON CONFLICT DO NOTHING;
  INSERT INTO campus_students(campus_id,name,english_name,grade) VALUES(v_campus_id,'여서준','Leo Yeo','초등부') ON CONFLICT DO NOTHING;
  INSERT INTO campus_students(campus_id,name,english_name,grade) VALUES(v_campus_id,'주서현','Stella Ju','초등부') ON CONFLICT DO NOTHING;
  INSERT INTO campus_students(campus_id,name,english_name,grade) VALUES(v_campus_id,'박봄','Bom Park','초등부') ON CONFLICT DO NOTHING;
  INSERT INTO campus_students(campus_id,name,english_name,grade) VALUES(v_campus_id,'윤찬영','David Yun','초등부') ON CONFLICT DO NOTHING;
  INSERT INTO campus_students(campus_id,name,english_name,grade) VALUES(v_campus_id,'박서윤','Alice Park','초등부') ON CONFLICT DO NOTHING;
  INSERT INTO campus_students(campus_id,name,english_name,grade) VALUES(v_campus_id,'장유나','Luna Jang','초등부') ON CONFLICT DO NOTHING;
  INSERT INTO campus_students(campus_id,name,english_name,grade) VALUES(v_campus_id,'오윤성','Yunie Oh','초등부') ON CONFLICT DO NOTHING;
  INSERT INTO campus_students(campus_id,name,english_name,grade) VALUES(v_campus_id,'전여원','Emily Jeon','초등부') ON CONFLICT DO NOTHING;
  INSERT INTO campus_students(campus_id,name,english_name,grade) VALUES(v_campus_id,'강유하','Ana Kang','초등부') ON CONFLICT DO NOTHING;
  INSERT INTO campus_students(campus_id,name,english_name,grade) VALUES(v_campus_id,'함채윤','Ellie Ham','초등부') ON CONFLICT DO NOTHING;
  INSERT INTO campus_students(campus_id,name,english_name,grade) VALUES(v_campus_id,'김서아','Sophia Kim','초등부') ON CONFLICT DO NOTHING;
  INSERT INTO campus_students(campus_id,name,english_name,grade) VALUES(v_campus_id,'박재율','William Park','초등부') ON CONFLICT DO NOTHING;
  INSERT INTO campus_students(campus_id,name,english_name,grade) VALUES(v_campus_id,'김휘','Hwi Kim','초등부') ON CONFLICT DO NOTHING;
  INSERT INTO campus_students(campus_id,name,english_name,grade) VALUES(v_campus_id,'안이준','Jun An','초등부') ON CONFLICT DO NOTHING;
  INSERT INTO campus_students(campus_id,name,english_name,grade) VALUES(v_campus_id,'김예오','Jack Kim','초등부') ON CONFLICT DO NOTHING;
  INSERT INTO campus_students(campus_id,name,english_name,grade) VALUES(v_campus_id,'장유진','Eugene Jang','초등부') ON CONFLICT DO NOTHING;
  INSERT INTO campus_students(campus_id,name,english_name,grade) VALUES(v_campus_id,'유지안','Olivia Yoo','초등부') ON CONFLICT DO NOTHING;
  INSERT INTO campus_students(campus_id,name,english_name,grade) VALUES(v_campus_id,'이도원','Dowon Lee','초등부') ON CONFLICT DO NOTHING;
  INSERT INTO campus_students(campus_id,name,english_name,grade) VALUES(v_campus_id,'이강민','Lucas Lee','초등부') ON CONFLICT DO NOTHING;
  INSERT INTO campus_students(campus_id,name,english_name,grade) VALUES(v_campus_id,'김세흔','Zoe Kim','초등부') ON CONFLICT DO NOTHING;
  INSERT INTO campus_students(campus_id,name,english_name,grade) VALUES(v_campus_id,'전태성','Jonathan Jeon','초등부') ON CONFLICT DO NOTHING;
  INSERT INTO campus_students(campus_id,name,english_name,grade) VALUES(v_campus_id,'권나은','Ella Gwon','초등부') ON CONFLICT DO NOTHING;
  INSERT INTO campus_students(campus_id,name,english_name,grade) VALUES(v_campus_id,'장지우','Jiwoo Jang','초등부') ON CONFLICT DO NOTHING;
  INSERT INTO campus_students(campus_id,name,english_name,grade) VALUES(v_campus_id,'김리한','Henry Kim','초등부') ON CONFLICT DO NOTHING;
  INSERT INTO campus_students(campus_id,name,english_name,grade) VALUES(v_campus_id,'이다인','Ila Lee','초등부') ON CONFLICT DO NOTHING;
  INSERT INTO campus_students(campus_id,name,english_name,grade) VALUES(v_campus_id,'최승민','Leo Choi','초등부') ON CONFLICT DO NOTHING;
  INSERT INTO campus_students(campus_id,name,english_name,grade) VALUES(v_campus_id,'김민규','Min Kim','초등부') ON CONFLICT DO NOTHING;
  INSERT INTO campus_students(campus_id,name,english_name,grade) VALUES(v_campus_id,'김태율','Ethan Kim','초등부') ON CONFLICT DO NOTHING;
  INSERT INTO campus_students(campus_id,name,english_name,grade) VALUES(v_campus_id,'최하음','Evie Choi','초등부') ON CONFLICT DO NOTHING;
  INSERT INTO campus_students(campus_id,name,english_name,grade) VALUES(v_campus_id,'류태주','Andrew Ryu','초등부') ON CONFLICT DO NOTHING;
  INSERT INTO campus_students(campus_id,name,english_name,grade) VALUES(v_campus_id,'유은우','Kai Yoo','초등부') ON CONFLICT DO NOTHING;
  INSERT INTO campus_students(campus_id,name,english_name,grade) VALUES(v_campus_id,'이예린','Angelina Lee','초등부') ON CONFLICT DO NOTHING;
  INSERT INTO campus_students(campus_id,name,english_name,grade) VALUES(v_campus_id,'장이안','Ian Jang','초등부') ON CONFLICT DO NOTHING;
  INSERT INTO campus_students(campus_id,name,english_name,grade) VALUES(v_campus_id,'권하를','Ha reul Kwon','초등부') ON CONFLICT DO NOTHING;
  INSERT INTO campus_students(campus_id,name,english_name,grade) VALUES(v_campus_id,'이유진','Yujin Lee','초등부') ON CONFLICT DO NOTHING;
  INSERT INTO campus_students(campus_id,name,english_name,grade) VALUES(v_campus_id,'김민서','Elsa Kim','초등부') ON CONFLICT DO NOTHING;
  INSERT INTO campus_students(campus_id,name,english_name,grade) VALUES(v_campus_id,'엄한빈','Rachel Um','초등부') ON CONFLICT DO NOTHING;
  INSERT INTO campus_students(campus_id,name,english_name,grade) VALUES(v_campus_id,'안시연','Chloe An','초등부') ON CONFLICT DO NOTHING;
  INSERT INTO campus_students(campus_id,name,english_name,grade) VALUES(v_campus_id,'이태윤','Lucas Lee','초등부') ON CONFLICT DO NOTHING;
  INSERT INTO campus_students(campus_id,name,english_name,grade) VALUES(v_campus_id,'김현서','Vinnie Kim','초등부') ON CONFLICT DO NOTHING;
  INSERT INTO campus_students(campus_id,name,english_name,grade) VALUES(v_campus_id,'임서윤','Lisa Lim','초등부') ON CONFLICT DO NOTHING;
  INSERT INTO campus_students(campus_id,name,english_name,grade) VALUES(v_campus_id,'김은율','Serena Kim','초등부') ON CONFLICT DO NOTHING;
  INSERT INTO campus_students(campus_id,name,english_name,grade) VALUES(v_campus_id,'권도환','Dio Kwon','초등부') ON CONFLICT DO NOTHING;
  INSERT INTO campus_students(campus_id,name,english_name,grade) VALUES(v_campus_id,'유영서','Chloe Yu','초등부') ON CONFLICT DO NOTHING;
  INSERT INTO campus_students(campus_id,name,english_name,grade) VALUES(v_campus_id,'김서원','Elena kim','초등부') ON CONFLICT DO NOTHING;
  INSERT INTO campus_students(campus_id,name,english_name,grade) VALUES(v_campus_id,'임지원','Aaron Im','초등부') ON CONFLICT DO NOTHING;
  INSERT INTO campus_students(campus_id,name,english_name,grade) VALUES(v_campus_id,'최나원','Nathan Choi','초등부') ON CONFLICT DO NOTHING;
  INSERT INTO campus_students(campus_id,name,english_name,grade) VALUES(v_campus_id,'김이음','Ayla Kim','초등부') ON CONFLICT DO NOTHING;
  INSERT INTO campus_students(campus_id,name,english_name,grade) VALUES(v_campus_id,'조윤재','Daniel Jo','초등부') ON CONFLICT DO NOTHING;
  INSERT INTO campus_students(campus_id,name,english_name,grade) VALUES(v_campus_id,'김지안','Jay Kim','초등부') ON CONFLICT DO NOTHING;
  INSERT INTO campus_students(campus_id,name,english_name,grade) VALUES(v_campus_id,'전서율','Jennie Jeon','초등부') ON CONFLICT DO NOTHING;
  INSERT INTO campus_students(campus_id,name,english_name,grade) VALUES(v_campus_id,'이하리','Lily Lee','초등부') ON CONFLICT DO NOTHING;
  INSERT INTO campus_students(campus_id,name,english_name,grade) VALUES(v_campus_id,'김예림','Judy Kim','초등부') ON CONFLICT DO NOTHING;
  INSERT INTO campus_students(campus_id,name,english_name,grade) VALUES(v_campus_id,'강메이슨','Mason Kang','초등부') ON CONFLICT DO NOTHING;
  INSERT INTO campus_students(campus_id,name,english_name,grade) VALUES(v_campus_id,'유준우','Junu Yu','초등부') ON CONFLICT DO NOTHING;
  INSERT INTO campus_students(campus_id,name,english_name,grade) VALUES(v_campus_id,'유준서','Henry Yoo','초등부') ON CONFLICT DO NOTHING;
  INSERT INTO campus_students(campus_id,name,english_name,grade) VALUES(v_campus_id,'전솔','Thor Jeon','초등부') ON CONFLICT DO NOTHING;
  INSERT INTO campus_students(campus_id,name,english_name,grade) VALUES(v_campus_id,'전재후','Jayden Jeon','초등부') ON CONFLICT DO NOTHING;
  INSERT INTO campus_students(campus_id,name,english_name,grade) VALUES(v_campus_id,'이민준','Aaron Lee','초등부') ON CONFLICT DO NOTHING;
  INSERT INTO campus_students(campus_id,name,english_name,grade) VALUES(v_campus_id,'이재아','Jaea Lee','초등부') ON CONFLICT DO NOTHING;
  INSERT INTO campus_students(campus_id,name,english_name,grade) VALUES(v_campus_id,'이지성','Eden Lee','초등부') ON CONFLICT DO NOTHING;
  INSERT INTO campus_students(campus_id,name,english_name,grade) VALUES(v_campus_id,'정지완','Kevin Jung','초등부') ON CONFLICT DO NOTHING;
  INSERT INTO campus_students(campus_id,name,english_name,grade) VALUES(v_campus_id,'김도빈','Ace Kim','초등부') ON CONFLICT DO NOTHING;
  INSERT INTO campus_students(campus_id,name,english_name,grade) VALUES(v_campus_id,'김건','Daniel Kim','초등부') ON CONFLICT DO NOTHING;
  INSERT INTO campus_students(campus_id,name,english_name,grade) VALUES(v_campus_id,'조수아','Sua Cho','초등부') ON CONFLICT DO NOTHING;
  INSERT INTO campus_students(campus_id,name,english_name,grade) VALUES(v_campus_id,'오재현','Jake Oh','초등부') ON CONFLICT DO NOTHING;
  INSERT INTO campus_students(campus_id,name,english_name,grade) VALUES(v_campus_id,'이하영','Jenny Lee','초등부') ON CONFLICT DO NOTHING;
  INSERT INTO campus_students(campus_id,name,english_name,grade) VALUES(v_campus_id,'황채현','Lua Hwang','초등부') ON CONFLICT DO NOTHING;
  INSERT INTO campus_students(campus_id,name,english_name,grade) VALUES(v_campus_id,'조재연','Justin Cho','초등부') ON CONFLICT DO NOTHING;
  INSERT INTO campus_students(campus_id,name,english_name,grade) VALUES(v_campus_id,'이채언','Clare Lee','초등부') ON CONFLICT DO NOTHING;
  INSERT INTO campus_students(campus_id,name,english_name,grade) VALUES(v_campus_id,'김준서','Leo Kim','초등부') ON CONFLICT DO NOTHING;
  INSERT INTO campus_students(campus_id,name,english_name,grade) VALUES(v_campus_id,'임세연','Ellie Im','초등부') ON CONFLICT DO NOTHING;
  INSERT INTO campus_students(campus_id,name,english_name,grade) VALUES(v_campus_id,'방서진','Sharon Bang','초등부') ON CONFLICT DO NOTHING;
  INSERT INTO campus_students(campus_id,name,english_name,grade) VALUES(v_campus_id,'김준','Jun Kim','초등부') ON CONFLICT DO NOTHING;
  INSERT INTO campus_students(campus_id,name,english_name,grade) VALUES(v_campus_id,'조하진','Jaden Jo','초등부') ON CONFLICT DO NOTHING;
  INSERT INTO campus_students(campus_id,name,english_name,grade) VALUES(v_campus_id,'구교율','Aiden Ku','초등부') ON CONFLICT DO NOTHING;
  INSERT INTO campus_students(campus_id,name,english_name,grade) VALUES(v_campus_id,'서다은','Laura Seo','초등부') ON CONFLICT DO NOTHING;
  INSERT INTO campus_students(campus_id,name,english_name,grade) VALUES(v_campus_id,'김시온','Bella Kim','초등부') ON CONFLICT DO NOTHING;
  INSERT INTO campus_students(campus_id,name,english_name,grade) VALUES(v_campus_id,'오유나','Luna Oh','초등부') ON CONFLICT DO NOTHING;
  INSERT INTO campus_students(campus_id,name,english_name,grade) VALUES(v_campus_id,'박준휘','Junhwi Park','초등부') ON CONFLICT DO NOTHING;
  INSERT INTO campus_students(campus_id,name,english_name,grade) VALUES(v_campus_id,'김이준','Ethan Kim','초등부') ON CONFLICT DO NOTHING;
  INSERT INTO campus_students(campus_id,name,english_name,grade) VALUES(v_campus_id,'조재현','Hyun Cho','초등부') ON CONFLICT DO NOTHING;
  INSERT INTO campus_students(campus_id,name,english_name,grade) VALUES(v_campus_id,'대기 1) S1B 유지호',NULL,'초등부') ON CONFLICT DO NOTHING;
  INSERT INTO campus_students(campus_id,name,english_name,grade) VALUES(v_campus_id,'김서우','Lily Kim','초등부') ON CONFLICT DO NOTHING;
  INSERT INTO campus_students(campus_id,name,english_name,grade) VALUES(v_campus_id,'김제이','Jay Kim','초등부') ON CONFLICT DO NOTHING;
  INSERT INTO campus_students(campus_id,name,english_name,grade) VALUES(v_campus_id,'전봄','Lisa Jeon','초등부') ON CONFLICT DO NOTHING;
  INSERT INTO campus_students(campus_id,name,english_name,grade) VALUES(v_campus_id,'정민재','Minjae Jeong','초등부') ON CONFLICT DO NOTHING;
  INSERT INTO campus_students(campus_id,name,english_name,grade) VALUES(v_campus_id,'조윤서','Chloe Cho','초등부') ON CONFLICT DO NOTHING;
  INSERT INTO campus_students(campus_id,name,english_name,grade) VALUES(v_campus_id,'주우재','Erik Zoo','초등부') ON CONFLICT DO NOTHING;
  INSERT INTO campus_students(campus_id,name,english_name,grade) VALUES(v_campus_id,'노유영','Mint Roh','초등부') ON CONFLICT DO NOTHING;

  -- 세션: 초등부 매일반
  INSERT INTO class_sessions(campus_id,name,time_range,month,sort_order) VALUES(v_campus_id,'초등부 매일반','3:10~4:30','2026년 4월',0) RETURNING id INTO v_sess_id;

  -- 반: LX C
  INSERT INTO classes(session_id,campus_id,level,room,teacher,color,sort_order) VALUES(v_sess_id,v_campus_id,'LX C','Liz','America','#3b82f6',0) RETURNING id INTO v_cls_id;

  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='김도현' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{"월":"8호차","화":"8호차","수":"8호차","목":"8호차","금":"8호차"}'::jsonb,'{"월":"1호차","화":"1호차","수":"1호차","목":"1호차","금":"1호차"}'::jsonb,0) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;
  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='박세인' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{"월":"1호차","화":"1호차","수":"1호차","목":"1호차","금":"1호차"}'::jsonb,'{"월":"1호차","화":"1호차","수":"1호차","목":"1호차","금":"1호차"}'::jsonb,1) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;
  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='홍시연' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{}'::jsonb,'{}'::jsonb,2) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;
  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='하이진' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{"월":"6호차","화":"6호차","수":"6호차","목":"6호차","금":"6호차"}'::jsonb,'{"월":"7호차","화":"7호차","수":"7호차","목":"7호차","금":"7호차"}'::jsonb,3) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;
  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='장인우' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{"수":"5호차"}'::jsonb,'{"월":"8호차","화":"8호차","수":"8호차","목":"8호차","금":"8호차"}'::jsonb,4) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;
  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='김태유' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{}'::jsonb,'{}'::jsonb,5) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;
  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='송다온' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{"월":"1호차","화":"1호차","수":"1호차","목":"1호차","금":"1호차"}'::jsonb,'{"월":"1호차","화":"1호차","수":"1호차","목":"1호차","금":"1호차"}'::jsonb,6) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;
  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='박리환' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{"월":"6호차","화":"6호차","수":"6호차","목":"6호차","금":"6호차"}'::jsonb,'{"월":"6호차","화":"6호차","수":"6호차","목":"6호차","금":"6호차"}'::jsonb,7) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;
  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='서성재' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{}'::jsonb,'{}'::jsonb,8) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;
  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='정다라윤' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{}'::jsonb,'{}'::jsonb,9) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;
  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='최수빈' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{}'::jsonb,'{}'::jsonb,10) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;

  -- 반: MGT1
  INSERT INTO classes(session_id,campus_id,level,room,teacher,color,sort_order) VALUES(v_sess_id,v_campus_id,'MGT1','Christopher','Belgium','#22c55e',1) RETURNING id INTO v_cls_id;

  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='유건우' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{"월":"5호차","화":"5호차","수":"5호차","목":"5호차","금":"5호차"}'::jsonb,'{"월":"5호차","화":"5호차","수":"5호차","목":"5호차","금":"5호차"}'::jsonb,0) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;
  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='홍지안' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{}'::jsonb,'{}'::jsonb,1) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;
  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='이샤론' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{"월":"2호차","화":"2호차","수":"2호차","목":"2호차","금":"2호차"}'::jsonb,'{"월":"2호차","화":"2호차","수":"2호차","목":"2호차","금":"2호차"}'::jsonb,2) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;
  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='오나윤' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{"월":"6호차","화":"6호차","수":"6호차","목":"6호차","금":"6호차"}'::jsonb,'{"월":"6호차","화":"6호차","수":"6호차","목":"6호차","금":"6호차"}'::jsonb,3) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;
  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='오나연' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{"월":"6호차","화":"6호차","수":"6호차","목":"6호차","금":"6호차"}'::jsonb,'{"월":"6호차","화":"6호차","수":"6호차","목":"6호차","금":"6호차"}'::jsonb,4) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;
  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='이승호' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{"월":"6호차","화":"6호차","수":"6호차","목":"6호차","금":"6호차"}'::jsonb,'{"월":"3호차","화":"3호차","수":"3호차","목":"3호차","금":"3호차"}'::jsonb,5) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;
  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='임아리' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{}'::jsonb,'{}'::jsonb,6) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;

  -- 반: S1
  INSERT INTO classes(session_id,campus_id,level,room,teacher,color,sort_order) VALUES(v_sess_id,v_campus_id,'S1','Emily','Canada','#8b5cf6',2) RETURNING id INTO v_cls_id;

  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='박주안' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{}'::jsonb,'{}'::jsonb,0) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;
  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='구이현' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{"월":"5호차","화":"5호차","수":"5호차","목":"5호차","금":"5호차"}'::jsonb,'{"월":"8호차","화":"8호차","수":"8호차","목":"8호차","금":"8호차"}'::jsonb,1) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;
  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='이로이' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{"월":"7호차","화":"7호차","수":"7호차","목":"7호차","금":"7호차"}'::jsonb,'{"월":"7호차","화":"7호차","수":"7호차","목":"7호차","금":"7호차"}'::jsonb,2) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;
  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='한서율' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{"월":"1호차","화":"1호차","수":"1호차","목":"1호차","금":"1호차"}'::jsonb,'{"월":"1호차","화":"1호차","수":"1호차","목":"1호차","금":"1호차"}'::jsonb,3) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;
  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='김이안' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{"월":"6호차","화":"6호차","수":"6호차","목":"6호차","금":"6호차"}'::jsonb,'{"월":"6호차","화":"6호차","수":"6호차","목":"6호차","금":"6호차"}'::jsonb,4) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;
  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='강민정' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{"월":"3호차","화":"3호차","수":"3호차","목":"3호차","금":"3호차"}'::jsonb,'{"월":"3호차","화":"3호차","수":"3호차","목":"3호차","금":"3호차"}'::jsonb,5) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;
  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='김민결' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{}'::jsonb,'{}'::jsonb,6) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;
  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='백주원' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{"월":"8호차","화":"8호차","수":"8호차","목":"8호차","금":"8호차"}'::jsonb,'{"월":"8호차","화":"8호차","수":"8호차","목":"8호차","금":"8호차"}'::jsonb,7) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;
  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='김채아' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{"월":"6호차","화":"6호차","수":"6호차","목":"6호차","금":"6호차"}'::jsonb,'{"월":"6호차","화":"6호차","수":"6호차","목":"6호차","금":"6호차"}'::jsonb,8) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;
  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='임지후' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{}'::jsonb,'{}'::jsonb,9) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;
  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='민채은' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{}'::jsonb,'{}'::jsonb,10) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;

  -- 반: MAG1
  INSERT INTO classes(session_id,campus_id,level,room,teacher,color,sort_order) VALUES(v_sess_id,v_campus_id,'MAG1','Richard','Denmark','#f97316',3) RETURNING id INTO v_cls_id;

  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='김하윤' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{"월":"3호차","화":"3호차","수":"3호차","목":"3호차","금":"3호차"}'::jsonb,'{"월":"3호차","화":"3호차","수":"3호차","목":"3호차","금":"3호차"}'::jsonb,0) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;
  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='박주희' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{"월":"7호차","화":"7호차","수":"7호차","목":"7호차","금":"7호차"}'::jsonb,'{"월":"7호차","화":"7호차","수":"7호차","목":"7호차","금":"7호차"}'::jsonb,1) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;
  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='정리하' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{"월":"6호차","화":"6호차","수":"6호차","목":"6호차","금":"6호차"}'::jsonb,'{"월":"6호차","화":"6호차","수":"6호차","목":"6호차","금":"6호차"}'::jsonb,2) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;
  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='유재준' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{"월":"3호차","화":"3호차","수":"3호차","목":"3호차","금":"3호차"}'::jsonb,'{"월":"3호차","화":"3호차","수":"3호차","목":"3호차","금":"3호차"}'::jsonb,3) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;
  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='안시온' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{"월":"8호차","화":"8호차","수":"8호차","목":"8호차","금":"8호차"}'::jsonb,'{"월":"8호차","화":"8호차","수":"8호차","목":"8호차","금":"8호차"}'::jsonb,4) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;
  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='이도겸' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{"월":"2호차","화":"2호차","수":"2호차","목":"2호차","금":"2호차"}'::jsonb,'{"월":"2호차","화":"2호차","수":"2호차","목":"2호차","금":"2호차"}'::jsonb,5) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;
  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='이세연' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{"월":"3호차","화":"3호차","수":"3호차","목":"3호차","금":"3호차"}'::jsonb,'{"월":"3호차","화":"3호차","수":"3호차","목":"3호차","금":"3호차"}'::jsonb,6) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;
  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='유설아' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{}'::jsonb,'{}'::jsonb,7) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;

  -- 반: GT2
  INSERT INTO classes(session_id,campus_id,level,room,teacher,color,sort_order) VALUES(v_sess_id,v_campus_id,'GT2','Deavian','England','#ec4899',4) RETURNING id INTO v_cls_id;

  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='이승원' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{"월":"6호차","화":"6호차","수":"6호차","목":"6호차","금":"6호차"}'::jsonb,'{"월":"6호차","화":"6호차","수":"6호차","목":"6호차","금":"6호차"}'::jsonb,0) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;
  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='윤슬아' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{"월":"6호차","화":"6호차","수":"6호차","목":"6호차","금":"6호차"}'::jsonb,'{"월":"7호차","화":"7호차","수":"7호차","목":"7호차","금":"7호차"}'::jsonb,1) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;
  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='곽수현' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{}'::jsonb,'{}'::jsonb,2) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;
  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='문예준' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{"월":"7호차","화":"7호차","수":"7호차","목":"7호차","금":"7호차"}'::jsonb,'{"월":"7호차","화":"7호차","수":"7호차","목":"7호차","금":"7호차"}'::jsonb,3) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;
  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='곽지훈' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{}'::jsonb,'{}'::jsonb,4) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;
  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='이선예' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{}'::jsonb,'{}'::jsonb,5) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;

  -- 반: MAG2 (3일)-M
  INSERT INTO classes(session_id,campus_id,level,room,teacher,color,sort_order) VALUES(v_sess_id,v_campus_id,'MAG2 (3일)-M','Sarah','France','#06b6d4',5) RETURNING id INTO v_cls_id;

  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='최정원' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{}'::jsonb,'{}'::jsonb,0) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;
  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='김민채' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{"월":"6호차","수":"6호차","금":"6호차"}'::jsonb,'{"월":"6호차","수":"6호차","금":"6호차"}'::jsonb,1) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;
  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='문선우' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{"월":"3호차","수":"3호차","금":"3호차"}'::jsonb,'{"월":"3호차","수":"3호차","금":"3호차"}'::jsonb,2) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;
  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='문채윤' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{"월":"8호차","수":"8호차","금":"8호차"}'::jsonb,'{"월":"8호차","수":"8호차","금":"8호차"}'::jsonb,3) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;
  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='임재희' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{"월":"8호차","수":"8호차","금":"8호차"}'::jsonb,'{"월":"8호차","수":"8호차","금":"8호차"}'::jsonb,4) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;
  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='서지민' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{"월":"3호차","수":"3호차","금":"3호차"}'::jsonb,'{"월":"5호차","수":"5호차","금":"5호차"}'::jsonb,5) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;
  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='김조이' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{}'::jsonb,'{}'::jsonb,6) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;
  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='김리현' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{}'::jsonb,'{}'::jsonb,7) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;
  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='차혜윰' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{"월":"6호차","수":"6호차","금":"7호차"}'::jsonb,'{"월":"7호차","수":"7호차","금":"7호차"}'::jsonb,8) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;
  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='주선호' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{"월":"3호차","수":"3호차","금":"3호차"}'::jsonb,'{"월":"3호차","수":"3호차","금":"3호차"}'::jsonb,9) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;
  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='김태인' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{"월":"3호차","수":"3호차","금":"3호차"}'::jsonb,'{"월":"2호차","수":"2호차","금":"2호차"}'::jsonb,10) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;
  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='박정우' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{}'::jsonb,'{}'::jsonb,11) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;

  -- 반: MAG3 (3일)
  INSERT INTO classes(session_id,campus_id,level,room,teacher,color,sort_order) VALUES(v_sess_id,v_campus_id,'MAG3 (3일)','Ashley','Norway','#ef4444',6) RETURNING id INTO v_cls_id;

  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='서아인' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{"월":"6호차","수":"6호차","금":"6호차"}'::jsonb,'{"월":"7호차","수":"7호차","금":"7호차"}'::jsonb,0) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;
  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='최시아' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{"월":"3호차","수":"3호차","금":"3호차"}'::jsonb,'{}'::jsonb,1) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;
  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='위아인' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{}'::jsonb,'{}'::jsonb,2) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;
  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='유서연' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{"월":"5호차","수":"5호차","금":"5호차"}'::jsonb,'{"월":"8호차","수":"8호차","금":"8호차"}'::jsonb,3) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;
  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='박연서' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{}'::jsonb,'{}'::jsonb,4) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;
  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='정근서' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{"월":"7호차","수":"7호차","금":"7호차"}'::jsonb,'{"월":"7호차","수":"7호차","금":"7호차"}'::jsonb,5) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;
  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='김예원' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{"월":"7호차","수":"7호차","금":"7호차"}'::jsonb,'{"월":"7호차","수":"7호차","금":"7호차"}'::jsonb,6) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;
  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='이유주' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{}'::jsonb,'{}'::jsonb,7) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;

  -- 반: MAG3 (3일)
  INSERT INTO classes(session_id,campus_id,level,room,teacher,color,sort_order) VALUES(v_sess_id,v_campus_id,'MAG3 (3일)','Zebbriana','Sweden','#a16207',7) RETURNING id INTO v_cls_id;

  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='이지오' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{"월":"6호차","수":"6호차","금":"6호차"}'::jsonb,'{"월":"2호차","수":"2호차","금":"2호차"}'::jsonb,0) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;
  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='윤서진' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{"월":"6호차","수":"6호차","금":"6호차"}'::jsonb,'{}'::jsonb,1) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;
  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='최윤후' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{"월":"3호차","수":"3호차","금":"3호차"}'::jsonb,'{}'::jsonb,2) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;
  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='김주아' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{"월":"3호차","수":"3호차","금":"3호차"}'::jsonb,'{"월":"5호차","수":"5호차","금":"5호차"}'::jsonb,3) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;
  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='이로원' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{"월":"6호차","수":"6호차","금":"6호차"}'::jsonb,'{"월":"6호차","수":"5호차","금":"5호차"}'::jsonb,4) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;
  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='장주호' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{"월":"2호차","수":"2호차","금":"2호차"}'::jsonb,'{"월":"2호차","수":"2호차","금":"2호차"}'::jsonb,5) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;

  -- 세션: 초등부 월수금
  INSERT INTO class_sessions(campus_id,name,time_range,month,sort_order) VALUES(v_campus_id,'초등부 월수금','4:30~6:05','2026년 4월',1) RETURNING id INTO v_sess_id;

  -- 반: GT1
  INSERT INTO classes(session_id,campus_id,level,room,teacher,color,sort_order) VALUES(v_sess_id,v_campus_id,'GT1','Delaney','America','#6366f1',0) RETURNING id INTO v_cls_id;

  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='황도훈' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{"월":"7호차","수":"7호차","금":"7호차"}'::jsonb,'{"월":"7호차","수":"7호차","금":"7호차"}'::jsonb,0) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;
  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='이지율' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{"월":"3호차","수":"3호차","금":"3호차"}'::jsonb,'{"월":"3호차","수":"3호차","금":"3호차"}'::jsonb,1) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;
  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='진은우' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{"월":"2호차","수":"2호차","금":"2호차"}'::jsonb,'{"월":"2호차","수":"2호차","금":"2호차"}'::jsonb,2) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;
  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='최윤아' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{}'::jsonb,'{"월":"6호차","수":"6호차","금":"6호차"}'::jsonb,3) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;
  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='김재이' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{"월":"2호차","수":"2호차","금":"2호차"}'::jsonb,'{"월":"2호차","수":"2호차","금":"2호차"}'::jsonb,4) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;
  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='신민경' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{}'::jsonb,'{}'::jsonb,5) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;
  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='서아민' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{"월":"7호차","수":"7호차","금":"7호차"}'::jsonb,'{"월":"7호차","수":"7호차","금":"7호차"}'::jsonb,6) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;
  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='윤서진' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{"월":"6호차","수":"6호차","금":"6호차"}'::jsonb,'{"월":"6호차","수":"6호차","금":"6호차"}'::jsonb,7) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;
  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='최서준' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{"월":"1호차","수":"1호차","금":"1호차"}'::jsonb,'{"월":"1호차","수":"1호차","금":"1호차"}'::jsonb,8) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;
  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='김태준' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{"월":"2호차","수":"2호차","금":"2호차"}'::jsonb,'{"월":"2호차","수":"2호차","금":"2호차"}'::jsonb,9) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;

  -- 반: MGT1
  INSERT INTO classes(session_id,campus_id,level,room,teacher,color,sort_order) VALUES(v_sess_id,v_campus_id,'MGT1','Christopher','Belgium','#14b8a6',1) RETURNING id INTO v_cls_id;

  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='조이준' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{"월":"6호차","수":"6호차","금":"6호차"}'::jsonb,'{"월":"6호차","수":"6호차","금":"6호차"}'::jsonb,0) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;
  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='김도준' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{}'::jsonb,'{}'::jsonb,1) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;
  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='박재의' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{"월":"8호차","수":"8호차","금":"8호차"}'::jsonb,'{"월":"8호차","수":"8호차","금":"8호차"}'::jsonb,2) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;
  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='조윤성' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{"월":"5호차","수":"5호차","금":"5호차"}'::jsonb,'{"월":"5호차","수":"5호차","금":"5호차"}'::jsonb,3) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;
  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='전여진' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{"월":"6호차","수":"6호차","금":"6호차"}'::jsonb,'{"월":"6호차","수":"6호차","금":"6호차"}'::jsonb,4) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;
  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='박시우' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{"월":"1호차","수":"1호차","금":"1호차"}'::jsonb,'{"월":"1호차","수":"1호차","금":"1호차"}'::jsonb,5) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;
  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='정윤우' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{"월":"6호차","수":"6호차","금":"6호차"}'::jsonb,'{}'::jsonb,6) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;
  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='손동후' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{"월":"1호차","수":"1호차","금":"1호차"}'::jsonb,'{"월":"1호차","수":"1호차","금":"1호차"}'::jsonb,7) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;
  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='위서준' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{"월":"8호차","수":"8호차","금":"8호차"}'::jsonb,'{"월":"8호차","수":"8호차","금":"8호차"}'::jsonb,8) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;
  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='윤찬서' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{"월":"6호차","수":"6호차","금":"6호차"}'::jsonb,'{"월":"6호차","수":"6호차","금":"6호차"}'::jsonb,9) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;
  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='홍유나' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{"월":"8호차","수":"8호차","금":"8호차"}'::jsonb,'{"월":"8호차","수":"8호차","금":"8호차"}'::jsonb,10) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;
  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='김서윤' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{"월":"8호차","수":"8호차","금":"8호차"}'::jsonb,'{"월":"8호차","수":"8호차","금":"8호차"}'::jsonb,11) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;

  -- 반: S1
  INSERT INTO classes(session_id,campus_id,level,room,teacher,color,sort_order) VALUES(v_sess_id,v_campus_id,'S1','Emily','Canada','#3b82f6',2) RETURNING id INTO v_cls_id;

  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='최이섭' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{}'::jsonb,'{"월":"5호차","수":"5호차","금":"5호차"}'::jsonb,0) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;
  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='김시현' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{}'::jsonb,'{}'::jsonb,1) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;
  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='이윤설' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{"월":"5호차","수":"5호차","금":"5호차"}'::jsonb,'{"월":"5호차","수":"5호차","금":"5호차"}'::jsonb,2) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;
  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='박이준' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{}'::jsonb,'{"월":"5호차","수":"5호차","금":"5호차"}'::jsonb,3) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;
  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='이예나' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{"월":"6호차","수":"6호차","금":"6호차"}'::jsonb,'{"월":"6호차","수":"6호차","금":"6호차"}'::jsonb,4) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;
  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='김이안' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{}'::jsonb,'{}'::jsonb,5) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;
  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='유하진' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{"월":"6호차","수":"6호차","금":"6호차"}'::jsonb,'{"월":"6호차","수":"6호차","금":"6호차"}'::jsonb,6) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;
  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='최우혁' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{"월":"6호차","수":"6호차","금":"6호차"}'::jsonb,'{"월":"6호차","수":"6호차","금":"6호차"}'::jsonb,7) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;
  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='조아인' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{"월":"3호차","수":"3호차","금":"3호차"}'::jsonb,'{"월":"3호차","수":"3호차","금":"3호차"}'::jsonb,8) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;
  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='유지호' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{"월":"7호차","수":"7호차","금":"7호차"}'::jsonb,'{"월":"7호차","수":"7호차","금":"7호차"}'::jsonb,9) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;
  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='심서아' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{"월":"8호차","수":"8호차","금":"8호차"}'::jsonb,'{"월":"8호차","수":"8호차","금":"8호차"}'::jsonb,10) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;
  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='이윤우' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{"월":"5호차","수":"5호차","금":"5호차"}'::jsonb,'{"월":"5호차","수":"5호차","금":"5호차"}'::jsonb,11) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;
  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='강민정' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{}'::jsonb,'{}'::jsonb,12) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;
  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='김민결' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{}'::jsonb,'{}'::jsonb,13) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;
  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='홍한온' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{}'::jsonb,'{}'::jsonb,14) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;

  -- 반: GT2
  INSERT INTO classes(session_id,campus_id,level,room,teacher,color,sort_order) VALUES(v_sess_id,v_campus_id,'GT2','Daevian','Denmark','#22c55e',3) RETURNING id INTO v_cls_id;

  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='홍연재' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{}'::jsonb,'{"월":"8호차","수":"8호차","금":"8호차"}'::jsonb,0) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;
  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='최세영' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{"월":"8호차","수":"8호차","금":"8호차"}'::jsonb,'{"월":"8호차","수":"8호차","금":"8호차"}'::jsonb,1) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;
  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='염하준' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{"월":"2호차","수":"2호차","금":"2호차"}'::jsonb,'{"월":"2호차","수":"2호차","금":"2호차"}'::jsonb,2) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;
  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='정세희' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{}'::jsonb,'{}'::jsonb,3) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;
  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='권도희' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{}'::jsonb,'{}'::jsonb,4) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;
  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='강혜린' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{}'::jsonb,'{}'::jsonb,5) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;
  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='김조이' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{"월":"6호차","수":"6호차","금":"6호차"}'::jsonb,'{"월":"7호차","수":"7호차","금":"7호차"}'::jsonb,6) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;
  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='박서연' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{"월":"6호차","수":"6호차","금":"6호차"}'::jsonb,'{"월":"6호차","수":"6호차","금":"6호차"}'::jsonb,7) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;
  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='최수현' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{"월":"8호차","수":"8호차","금":"8호차"}'::jsonb,'{"월":"8호차","수":"8호차","금":"8호차"}'::jsonb,8) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;
  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='정현준' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{"월":"8호차","수":"8호차","금":"8호차"}'::jsonb,'{"월":"8호차","수":"8호차","금":"8호차"}'::jsonb,9) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;
  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='오유' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{"월":"5호차","수":"5호차","금":"5호차"}'::jsonb,'{"월":"5호차","수":"5호차","금":"5호차"}'::jsonb,10) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;

  -- 반: GT2
  INSERT INTO classes(session_id,campus_id,level,room,teacher,color,sort_order) VALUES(v_sess_id,v_campus_id,'GT2','Liz','England','#8b5cf6',4) RETURNING id INTO v_cls_id;

  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='김도윤' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{"월":"6호차","수":"6호차","금":"6호차"}'::jsonb,'{"월":"6호차","수":"6호차","금":"6호차"}'::jsonb,0) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;
  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='김로운' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{}'::jsonb,'{}'::jsonb,1) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;
  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='권하진' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{"월":"5호차","수":"5호차","금":"5호차"}'::jsonb,'{"월":"5호차","수":"5호차","금":"5호차"}'::jsonb,2) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;
  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='성연제' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{}'::jsonb,'{}'::jsonb,3) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;
  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='오주안' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{"월":"8호차","수":"8호차","금":"8호차"}'::jsonb,'{"월":"8호차","수":"8호차","금":"8호차"}'::jsonb,4) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;
  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='박하윤' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{"월":"8호차","수":"8호차","금":"8호차"}'::jsonb,'{"월":"8호차","수":"8호차","금":"8호차"}'::jsonb,5) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;
  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='윤서훈' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{"월":"6호차","수":"6호차","금":"6호차"}'::jsonb,'{"월":"6호차","수":"6호차","금":"6호차"}'::jsonb,6) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;
  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='김도아' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{"월":"1호차","수":"1호차","금":"1호차"}'::jsonb,'{"월":"1호차","수":"1호차","금":"1호차"}'::jsonb,7) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;
  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='윤채원' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{"월":"6호차","수":"6호차","금":"6호차"}'::jsonb,'{"월":"3호차","수":"3호차","금":"3호차"}'::jsonb,8) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;
  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='진유준' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{"월":"6호차","수":"6호차","금":"6호차"}'::jsonb,'{"월":"6호차","수":"6호차","금":"6호차"}'::jsonb,9) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;
  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='안재현 신규' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{"월":"6호차","수":"6호차","금":"6호차"}'::jsonb,'{"월":"6호차","수":"6호차","금":"6호차"}'::jsonb,10) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;

  -- 반: MGT2
  INSERT INTO classes(session_id,campus_id,level,room,teacher,color,sort_order) VALUES(v_sess_id,v_campus_id,'MGT2','Richard','France','#f97316',5) RETURNING id INTO v_cls_id;

  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='박수아' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{"월":"5호차","수":"5호차","금":"5호차"}'::jsonb,'{"월":"5호차","수":"5호차","금":"5호차"}'::jsonb,0) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;
  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='고준' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{"월":"7호차","수":"7호차","금":"7호차"}'::jsonb,'{"월":"7호차","수":"7호차","금":"7호차"}'::jsonb,1) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;
  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='여서준' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{"월":"5호차","수":"5호차","금":"5호차"}'::jsonb,'{"월":"5호차","수":"5호차","금":"5호차"}'::jsonb,2) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;
  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='김도윤' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{"월":"7호차","수":"7호차","금":"7호차"}'::jsonb,'{"월":"7호차","수":"7호차","금":"7호차"}'::jsonb,3) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;
  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='주서현' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{"월":"6호차","수":"6호차","금":"6호차"}'::jsonb,'{"월":"3호차","수":"3호차","금":"3호차"}'::jsonb,4) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;
  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='박봄' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{"월":"3호차","수":"3호차","금":"3호차"}'::jsonb,'{"월":"3호차","수":"3호차","금":"3호차"}'::jsonb,5) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;
  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='윤찬영' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{"월":"1호차","수":"1호차","금":"1호차"}'::jsonb,'{"월":"1호차","수":"1호차","금":"1호차"}'::jsonb,6) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;
  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='박서윤' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{"월":"6호차","수":"6호차","금":"6호차"}'::jsonb,'{"월":"6호차","수":"6호차","금":"6호차"}'::jsonb,7) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;
  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='장유나' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{"월":"5호차","수":"5호차","금":"5호차"}'::jsonb,'{"월":"5호차","수":"5호차","금":"5호차"}'::jsonb,8) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;
  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='박봄' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{}'::jsonb,'{}'::jsonb,9) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;

  -- 반: S2-M
  INSERT INTO classes(session_id,campus_id,level,room,teacher,color,sort_order) VALUES(v_sess_id,v_campus_id,'S2-M','Ashley','Itlay','#ec4899',6) RETURNING id INTO v_cls_id;

  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='오윤성' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{"월":"8호차","수":"8호차","금":"8호차"}'::jsonb,'{"월":"8호차","수":"8호차","금":"8호차"}'::jsonb,0) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;
  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='전여원' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{"월":"6호차","수":"6호차","금":"6호차"}'::jsonb,'{"월":"6호차","수":"6호차","금":"6호차"}'::jsonb,1) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;
  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='강유하' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{}'::jsonb,'{}'::jsonb,2) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;
  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='함채윤' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{"월":"3호차","수":"3호차","금":"3호차"}'::jsonb,'{"월":"3호차","수":"3호차","금":"3호차"}'::jsonb,3) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;
  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='김서아' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{"월":"3호차","수":"3호차","금":"3호차"}'::jsonb,'{"월":"3호차","수":"3호차","금":"3호차"}'::jsonb,4) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;
  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='박재율' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{"월":"8호차","수":"8호차","금":"8호차"}'::jsonb,'{"월":"8호차","수":"8호차","금":"8호차"}'::jsonb,5) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;
  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='김휘' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{"월":"3호차","수":"3호차","금":"3호차"}'::jsonb,'{"월":"3호차","수":"3호차","금":"3호차"}'::jsonb,6) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;
  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='안이준' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{"월":"7호차","수":"7호차","금":"7호차"}'::jsonb,'{"월":"7호차","수":"7호차","금":"7호차"}'::jsonb,7) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;
  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='김예오' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{}'::jsonb,'{}'::jsonb,8) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;
  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='장유진' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{"월":"5호차","수":"5호차","금":"5호차"}'::jsonb,'{"월":"5호차","수":"5호차","금":"5호차"}'::jsonb,9) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;
  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='유지안' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{"월":"1호차","수":"1호차","금":"1호차"}'::jsonb,'{"월":"1호차","수":"1호차","금":"1호차"}'::jsonb,10) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;
  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='이도원' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{"월":"5호차","수":"5호차","금":"5호차"}'::jsonb,'{"월":"5호차","수":"5호차","금":"5호차"}'::jsonb,11) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;

  -- 반: S2
  INSERT INTO classes(session_id,campus_id,level,room,teacher,color,sort_order) VALUES(v_sess_id,v_campus_id,'S2','Zebbriana','Norway','#06b6d4',7) RETURNING id INTO v_cls_id;

  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='이강민' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{}'::jsonb,'{}'::jsonb,0) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;
  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='김세흔' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{"월":"8호차","수":"8호차","금":"8호차"}'::jsonb,'{"월":"8호차","수":"8호차","금":"8호차"}'::jsonb,1) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;
  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='전태성' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{"월":"7호차","수":"7호차","금":"7호차"}'::jsonb,'{"월":"7호차","수":"7호차","금":"7호차"}'::jsonb,2) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;
  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='권나은' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{"월":"2호차","수":"2호차","금":"2호차"}'::jsonb,'{"월":"2호차","수":"2호차","금":"2호차"}'::jsonb,3) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;
  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='장지우' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{"월":"5호차","수":"5호차","금":"5호차"}'::jsonb,'{"월":"5호차","수":"5호차","금":"5호차"}'::jsonb,4) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;
  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='김리한' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{"월":"8호차","수":"8호차","금":"8호차"}'::jsonb,'{"월":"8호차","수":"8호차","금":"8호차"}'::jsonb,5) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;
  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='이다인' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{"월":"2호차","수":"2호차","금":"2호차"}'::jsonb,'{"월":"2호차","수":"2호차","금":"2호차"}'::jsonb,6) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;
  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='최승민' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{"월":"2호차","수":"2호차","금":"2호차"}'::jsonb,'{"월":"2호차","수":"2호차","금":"2호차"}'::jsonb,7) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;

  -- 반: MAG2
  INSERT INTO classes(session_id,campus_id,level,room,teacher,color,sort_order) VALUES(v_sess_id,v_campus_id,'MAG2','Sarah','Sweden','#ef4444',8) RETURNING id INTO v_cls_id;

  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='김민규' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{"월":"7호차","수":"7호차","금":"7호차"}'::jsonb,'{"월":"7호차","수":"7호차","금":"7호차"}'::jsonb,0) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;
  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='김태율' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{"월":"7호차","수":"7호차","금":"7호차"}'::jsonb,'{"월":"7호차","수":"7호차","금":"7호차"}'::jsonb,1) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;
  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='최하음' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{}'::jsonb,'{}'::jsonb,2) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;
  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='류태주' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{}'::jsonb,'{}'::jsonb,3) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;
  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='유은우' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{"월":"3호차","수":"3호차","금":"3호차"}'::jsonb,'{"월":"3호차","수":"3호차","금":"3호차"}'::jsonb,4) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;
  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='이예린' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{}'::jsonb,'{}'::jsonb,5) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;
  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='장이안' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{"월":"5호차","수":"5호차","금":"5호차"}'::jsonb,'{"월":"5호차","수":"5호차","금":"5호차"}'::jsonb,6) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;
  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='권하를' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{"월":"2호차","수":"2호차","금":"2호차"}'::jsonb,'{"월":"3호차","수":"3호차","금":"3호차"}'::jsonb,7) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;

  -- 세션: 초등부 화목
  INSERT INTO class_sessions(campus_id,name,time_range,month,sort_order) VALUES(v_campus_id,'초등부 화목','4:30~6:50','2026년 4월',2) RETURNING id INTO v_sess_id;

  -- 반: MAG1-M
  INSERT INTO classes(session_id,campus_id,level,room,teacher,color,sort_order) VALUES(v_sess_id,v_campus_id,'MAG1-M','Richard','America','#a16207',0) RETURNING id INTO v_cls_id;

  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='이유진' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{"화":"7호차","목":"7호차"}'::jsonb,'{"화":"7호차","목":"7호차"}'::jsonb,0) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;
  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='김민서' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{"목":"6호차"}'::jsonb,'{"화":"6호차","목":"6호차"}'::jsonb,1) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;
  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='엄한빈' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{"화":"7호차","목":"7호차"}'::jsonb,'{"화":"7호차","목":"7호차"}'::jsonb,2) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;
  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='안시연' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{"화":"7호차","목":"7호차"}'::jsonb,'{"화":"7호차","목":"7호차"}'::jsonb,3) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;
  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='이태윤' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{"화":"3호차","목":"3호차"}'::jsonb,'{"화":"3호차","목":"3호차"}'::jsonb,4) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;
  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='김현서' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{"화":"1호차","목":"1호차"}'::jsonb,'{"화":"1호차","목":"1호차"}'::jsonb,5) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;
  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='임서윤' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{"화":"6호차","목":"6호차"}'::jsonb,'{"화":"6호차","목":"6호차"}'::jsonb,6) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;
  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='김도윤' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{"화":"5호차","목":"5호차"}'::jsonb,'{"화":"5호차","목":"5호차"}'::jsonb,7) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;

  -- 반: MAG1
  INSERT INTO classes(session_id,campus_id,level,room,teacher,color,sort_order) VALUES(v_sess_id,v_campus_id,'MAG1','Delaney','Belgium','#6366f1',1) RETURNING id INTO v_cls_id;

  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='김은율' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{}'::jsonb,'{}'::jsonb,0) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;
  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='권도환' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{"화":"8호차","목":"8호차"}'::jsonb,'{"화":"8호차","목":"8호차"}'::jsonb,1) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;
  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='유영서' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{"화":"3호차","목":"3호차"}'::jsonb,'{"화":"3호차","목":"3호차"}'::jsonb,2) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;
  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='김서원' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{}'::jsonb,'{}'::jsonb,3) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;
  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='임지원' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{}'::jsonb,'{}'::jsonb,4) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;
  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='최나원' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{}'::jsonb,'{}'::jsonb,5) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;
  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='김이음' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{}'::jsonb,'{}'::jsonb,6) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;

  -- 반: GT3
  INSERT INTO classes(session_id,campus_id,level,room,teacher,color,sort_order) VALUES(v_sess_id,v_campus_id,'GT3','Sarah','Canada','#14b8a6',2) RETURNING id INTO v_cls_id;

  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='조윤재' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{"화":"5호차","목":"5호차"}'::jsonb,'{"화":"5호차","목":"5호차"}'::jsonb,0) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;
  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='김지안' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{}'::jsonb,'{}'::jsonb,1) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;
  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='전서율' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{"화":"8호차","목":"8호차"}'::jsonb,'{"화":"8호차","목":"8호차"}'::jsonb,2) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;
  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='이하리' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{}'::jsonb,'{}'::jsonb,3) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;
  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='김예림' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{"화":"5호차","목":"5호차"}'::jsonb,'{"화":"5호차","목":"5호차"}'::jsonb,4) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;
  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='강메이슨' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{"화":"1호차","목":"1호차"}'::jsonb,'{"화":"1호차","목":"1호차"}'::jsonb,5) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;
  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='유준우' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{"화":"3호차","목":"3호차"}'::jsonb,'{"화":"3호차","목":"3호차"}'::jsonb,6) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;
  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='유준서' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{"화":"8호차","목":"8호차"}'::jsonb,'{"화":"8호차","목":"8호차"}'::jsonb,7) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;
  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='전솔' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{"화":"7호차","목":"7호차"}'::jsonb,'{"화":"7호차","목":"7호차"}'::jsonb,8) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;
  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='전재후' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{"화":"8호차","목":"8호차"}'::jsonb,'{"화":"8호차","목":"8호차"}'::jsonb,9) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;

  -- 반: MGT3
  INSERT INTO classes(session_id,campus_id,level,room,teacher,color,sort_order) VALUES(v_sess_id,v_campus_id,'MGT3','Liz','Denmark','#3b82f6',3) RETURNING id INTO v_cls_id;

  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='이민준' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{"화":"5호차","목":"5호차"}'::jsonb,'{"화":"5호차","목":"5호차"}'::jsonb,0) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;
  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='이재아' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{"화":"1호차","목":"1호차"}'::jsonb,'{"화":"1호차","목":"1호차"}'::jsonb,1) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;
  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='이지성' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{"화":"7호차","목":"7호차"}'::jsonb,'{"화":"7호차","목":"7호차"}'::jsonb,2) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;
  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='정지완' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{"화":"6호차","목":"6호차"}'::jsonb,'{"화":"6호차","목":"6호차"}'::jsonb,3) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;
  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='김도빈' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{}'::jsonb,'{}'::jsonb,4) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;
  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='김건' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{"화":"6호차","목":"6호차"}'::jsonb,'{"화":"6호차","목":"6호차"}'::jsonb,5) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;
  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='조수아' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{"화":"1호차","목":"1호차"}'::jsonb,'{"화":"1호차","목":"1호차"}'::jsonb,6) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;

  -- 반: S3
  INSERT INTO classes(session_id,campus_id,level,room,teacher,color,sort_order) VALUES(v_sess_id,v_campus_id,'S3','Daevian','France','#22c55e',4) RETURNING id INTO v_cls_id;

  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='오재현' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{}'::jsonb,'{}'::jsonb,0) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;
  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='이하영' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{"화":"8호차","목":"8호차"}'::jsonb,'{"화":"8호차","목":"8호차"}'::jsonb,1) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;
  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='황채현' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{"화":"7호차","목":"7호차"}'::jsonb,'{"화":"7호차","목":"7호차"}'::jsonb,2) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;
  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='조재연' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{"화":"7호차","목":"7호차"}'::jsonb,'{"화":"7호차","목":"7호차"}'::jsonb,3) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;
  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='이지성' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{"화":"7호차","목":"7호차"}'::jsonb,'{"화":"7호차","목":"7호차"}'::jsonb,4) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;
  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='이채언' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{}'::jsonb,'{}'::jsonb,5) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;
  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='김준서' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{"화":"7호차","목":"2호차"}'::jsonb,'{"화":"7호차","목":"7호차"}'::jsonb,6) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;
  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='임세연' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{"화":"6호차","목":"6호차"}'::jsonb,'{"화":"6호차","목":"6호차"}'::jsonb,7) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;
  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='방서진' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{"화":"6호차","목":"6호차"}'::jsonb,'{"화":"6호차","목":"6호차"}'::jsonb,8) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;

  -- 반: MAG3
  INSERT INTO classes(session_id,campus_id,level,room,teacher,color,sort_order) VALUES(v_sess_id,v_campus_id,'MAG3','Ashley','Germany','#8b5cf6',5) RETURNING id INTO v_cls_id;

  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='김준' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{}'::jsonb,'{}'::jsonb,0) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;
  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='조하진' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{}'::jsonb,'{}'::jsonb,1) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;
  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='구교율' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{}'::jsonb,'{}'::jsonb,2) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;
  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='서다은' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{"화":"6호차","목":"6호차"}'::jsonb,'{"화":"6호차","목":"6호차"}'::jsonb,3) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;
  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='김시온' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{"화":"8호차","목":"8호차"}'::jsonb,'{"화":"8호차","목":"8호차"}'::jsonb,4) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;
  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='오유나' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{}'::jsonb,'{}'::jsonb,5) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;
  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='박준휘' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{"화":"6호차","목":"6호차"}'::jsonb,'{"화":"6호차","목":"6호차"}'::jsonb,6) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;
  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='김하윤' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{"화":"8호차","목":"8호차"}'::jsonb,'{"화":"8호차","목":"8호차"}'::jsonb,7) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;
  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='정윤우' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{"화":"6호차","목":"2호차"}'::jsonb,'{"화":"6호차","목":"6호차"}'::jsonb,8) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;
  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='김이준' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{"화":"2호차","목":"2호차"}'::jsonb,'{"화":"2호차","목":"2호차"}'::jsonb,9) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;
  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='조재현' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{"화":"1호차","목":"1호차"}'::jsonb,'{"화":"1호차","목":"1호차"}'::jsonb,10) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;

  -- 반: S1
  INSERT INTO classes(session_id,campus_id,level,room,teacher,color,sort_order) VALUES(v_sess_id,v_campus_id,'S1','Zebbriana','Italy','#f97316',6) RETURNING id INTO v_cls_id;

  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='대기 1) S1B 유지호' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{}'::jsonb,'{}'::jsonb,0) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;

  -- 반: Honors2
  INSERT INTO classes(session_id,campus_id,level,room,teacher,color,sort_order) VALUES(v_sess_id,v_campus_id,'Honors2','Emily','Norway','#ec4899',7) RETURNING id INTO v_cls_id;

  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='김서우' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{"화":"2호차","목":"2호차"}'::jsonb,'{"화":"2호차","목":"2호차"}'::jsonb,0) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;
  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='김제이' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{}'::jsonb,'{}'::jsonb,1) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;
  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='전봄' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{"화":"7호차","목":"7호차"}'::jsonb,'{"화":"7호차","목":"7호차"}'::jsonb,2) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;
  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='정민재' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{"화":"2호차","목":"2호차"}'::jsonb,'{"화":"2호차","목":"2호차"}'::jsonb,3) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;

  -- 반: Honors3
  INSERT INTO classes(session_id,campus_id,level,room,teacher,color,sort_order) VALUES(v_sess_id,v_campus_id,'Honors3','Christopher','Sweden','#06b6d4',8) RETURNING id INTO v_cls_id;

  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='조윤서' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{}'::jsonb,'{}'::jsonb,0) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;
  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='주우재' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{}'::jsonb,'{}'::jsonb,1) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;
  SELECT id INTO v_stu_id FROM campus_students WHERE campus_id=v_campus_id AND name='노유영' LIMIT 1;
  IF v_stu_id IS NOT NULL THEN
    INSERT INTO class_enrollments(class_id,student_id,campus_id,arr_schedule,dep_schedule,sort_order) VALUES(v_cls_id,v_stu_id,v_campus_id,'{"화":"1호차","목":"1호차"}'::jsonb,'{"화":"1호차","목":"1호차"}'::jsonb,2) ON CONFLICT(class_id,student_id) DO NOTHING;
  END IF;

END $$;