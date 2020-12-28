"use strict";

// gulp packages
let gulp = require('gulp'); // gulp 4.0.0
let BROWSERSYNC = require('browser-sync').create(); // 웹서버 생성
let DEL = require('del'); // 파일 및 폴더 삭제

let USEREF = require('gulp-useref'); // 주석 내 파일들만 병합해주는 플러그인
let FILEINCLUDE = require('gulp-file-include'); // file include 할 수 있는 플러그인
let PRETTYHTML = require('gulp-pretty-html'); // HTML 가독성 좋게 indent 정리

let SOURCEMAPS = require('gulp-sourcemaps'); // 원본 파일과 조정한 파일과의 map 연결해주는 플러그인
let SASS = require('gulp-sass'); // SASS 를 gulp 에서 컴파일 할 때
SASS.compiler = require('node-sass'); // SASS 를 gulp 에서 컴파일 할 때
let CSSNANO = require('gulp-cssnano'); // CSS 경량화
let IMAGEMIN = require('gulp-imagemin'); // 이미지 압축
let UGLIFY = require('gulp-uglify-es').default; // JS 난독화

// path
let src = 'work'; // 작업용 폴더
let dist = 'dist'; // 배포용 폴더
let path = {
    src: {
        html: src + '/html/*.html',
        style: src + '/scss/**/*.scss',
        image: src + '/image/**/*.+(png|jpg|jpeg|gif|svg|ico)',
        iconScss: src + '/icon/**/*.scss',
        icon: src + '/icon/**/*.+(eot|woff|woff2|ttf|svg)',
        fonts: src + '/fonts/**/*.+(eot|woff|woff2|ttf|svg)',
        include: src + '/include/*',
        script: src + '/js/**/*.js',
        vendor: src + '/vendor/**/*.js'
    },
    dist: {
        index: '/html/index.html',
        html: dist + '/html',
        image: dist + '/image',
        style: dist + '/css',
        fonts: dist + '/webfonts',
        script: dist + '/js'
    }
};

// browserSync - 웹서버 초기셋팅
function browserSync(done) {
    BROWSERSYNC.init({
        startPath: path.dist.index,
        server: {
            baseDir: dist
        },
        open: 'external'
    });
    done();
}

// browserSyncReload - 웹서버 새로고침
function browserSyncReload(done) {
    BROWSERSYNC.reload({
        stream: true
    });
    done();
}

// html - inc 파일 통합 후 HTML 가독성 좋게 들여쓰기
function html(done) {
    return gulp.src(path.src.html)
        .pipe(FILEINCLUDE({
            prefix: '@@',
            basepath: '',
        }))
        .pipe(PRETTYHTML())
        .pipe(USEREF())
        .pipe(gulp.dest(path.dist.html))
        .pipe(BROWSERSYNC.reload({
            stream: true
        }));
    done();
}

// icon - 폰트로 불러오는 icon 스타일
function icon(done) {
    return gulp.src(path.src.style)
        .pipe(SOURCEMAPS.init())
        .pipe(SASS())
        .pipe(CSSNANO())
        .pipe(SOURCEMAPS.write())
        .pipe(gulp.dest(path.dist.style))
        .pipe(BROWSERSYNC.reload({
            stream: true
        }));
    done();
}

// sass - 분산돼있는 SCSS 파일을 분류별 css 폴더로 통합 후 경량화
function sass(done) {
    return gulp.src(path.src.style)
        .pipe(SOURCEMAPS.init())
        .pipe(SASS())
        .pipe(CSSNANO())
        .pipe(SOURCEMAPS.write())
        .pipe(gulp.dest(path.dist.style))
        .pipe(BROWSERSYNC.reload({
            stream: true
        }));
    done();
}

// moveImg - 이미지 이동
function moveImg(done) {
    return gulp.src(path.src.image)
        .pipe(gulp.dest(path.dist.image));
    done();
}

// webFonts - 웹폰트 파일 이동
function webFonts(done) {
    return gulp.src([path.src.icon, path.src.fonts])
        .pipe(gulp.dest(path.dist.fonts));
    done();
}

// watch - 각 function 들 실시간 변화 감지
function watch() {
    gulp.watch(path.src.style, sass);
    gulp.watch(path.src.image, moveImg);
    gulp.watch(path.src.iconScss, icon);
    gulp.watch(path.src.icon, webFonts);
    gulp.watch(path.src.html, html);
}

// script - 스크립트 난독화
function script(done) {
    return gulp.src(path.dist.script + '/*.js')
        .pipe(SOURCEMAPS.init())
        .pipe(UGLIFY())
        .pipe(SOURCEMAPS.write())
        .pipe(gulp.dest(path.dist.script));
    done();
}

// image - 이미지 압축
function image(done) {
    return gulp.src(path.src.image)
        .pipe(IMAGEMIN())
        .pipe(gulp.dest(path.dist.image));
    done();
}

// cleanSrc - 작업 폴더 삭제
function cleanSrc(done) {
    return DEL(src);
    done();
}

// cleanDist - 배포 폴더 삭제
function cleanDist(done) {
    return DEL(dist);
    done();
}

// gulp watch - 파일 변화 감지할 때 활용
gulp.task('watch',
    gulp.series(browserSync,
        gulp.parallel([watch, browserSyncReload])
    )
);

// gulp build - 난독화버전 배포시 활용
gulp.task('build', gulp.series(script, image));

// gulp build - 난독화 안된 버전 배포시 활용
gulp.task('draw', gulp.series(image));

// gulp cleanDist - 작업된 폴더 삭제
gulp.task('cleanDist', gulp.series(cleanDist));

// gulp - 작업시 활용
gulp.task('default',
    gulp.series(webFonts, moveImg,
        gulp.parallel([sass, icon, html]), browserSync,
        gulp.parallel(watch, browserSyncReload),
    )
);