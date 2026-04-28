import { vec3, mat4, mat3 } from 'gl-matrix';
import cubeOBJ from './cube.obj';
import skullOBJ from './skull.obj';
import busOBJ from './bus.obj';

import textureNumber1Url from 'url:./1.png';
import textureNumber2Url from 'url:./2.png';
import textureNumber3Url from 'url:./3.png';
import textureMaterial1Url from 'url:./gold.png';
import textureMaterial2Url from 'url:./iron.png';
import textureMaterial3Url from 'url:./copper.png';

import textureSkullURL from 'url:./skull.jpg';
import textureBusURL from 'url:./bus.png';

document.addEventListener('DOMContentLoaded', setup);

const canvas = document.getElementById('canvas');
const gl = canvas.getContext('webgl2');
gl.viewport(0, 0, canvas.width, canvas.height);

const cameraPos = [0.0, 0.0, 5.0];

let podiumPosition = [2.0, 0.0, 0.0];
let rotation1 = 0.0; // каждый куб относительно своего центра
let rotation2 = 0.0; // подиум относительно своего центра
let rotation3 = 0.0; // подиум относительно центра координат
let scale = 0.25;

let textureProportion = 0.5;

let VBO_cube, VBO_skull, VBO_bus;
let program, program1;
let positionAttribID = 0, texCoordAttribID = 1;
let startTime;

const vertexShaderSource = `#version 300 es
    precision mediump float;
    precision mediump int;

    layout (location = 0) in vec3 position;
    layout (location = 1) in vec2 texCoord;

    uniform struct Transform {
        mat4 model;
        mat4 viewProjection;
    } transform;

    out vec2 TexCoord;

    void main() {
        gl_Position = transform.viewProjection * transform.model * vec4(position, 1.0);
        TexCoord = vec2(texCoord.x, 1.0 - texCoord.y);
    }
`;

const fragmentShaderSource = `#version 300 es
    precision mediump float;
    precision mediump int;

    in vec2 TexCoord;

    uniform vec3 baseColor;
    uniform sampler2D textureNumber;
    uniform sampler2D textureMaterial;

    uniform float textureProportion;

    out vec4 color;

    void main() {
        vec4 numberColor = texture(textureNumber, TexCoord);
        vec4 materialColor = texture(textureMaterial, TexCoord);
        
        vec4 mixedColor = mix(materialColor, numberColor, numberColor.a * textureProportion);
        
        color = mixedColor * vec4(baseColor, 1.0);
        color.a = 1.0;
    }
`;

const fragmentShaderSource1 = `#version 300 es
    precision mediump float;
    precision highp int;

    in vec2 TexCoord;
    uniform sampler2D tex;

    out vec4 color;

    void main() {
        color = texture(tex, TexCoord);
    }
`;

//------------------------------------------------

const fullscreenVertexShader = `#version 300 es
    precision mediump float;
    
    const vec2 positions[6] = vec2[6](
        vec2(-1.0, -1.0),
        vec2( 1.0, -1.0),
        vec2(-1.0,  1.0),
        vec2(-1.0,  1.0),
        vec2( 1.0, -1.0),
        vec2( 1.0,  1.0)
    );
    
    out vec2 vTexCoord;
    
    void main() {
        vec2 pos = positions[gl_VertexID];
        vTexCoord = pos * 0.5 + 0.5;
        gl_Position = vec4(pos, 0.0, 1.0);
    }
`;

const outputFragmentShader = `#version 300 es
    precision mediump float;
    
    in vec2 vTexCoord;
    uniform sampler2D u_sceneTexture;
    
    out vec4 color;
    
    void main() {
        color = texture(u_sceneTexture, vTexCoord);
    }
`;

const vignetteFragmentShader = `#version 300 es
    precision mediump float;
    
    in vec2 vTexCoord;
    uniform sampler2D u_sceneTexture;

    const float u_intensity = 0.2;
    const float u_roundness = 0.5;
    const float u_smoothness = 1.5;
    
    out vec4 color;
    
    void main() {
        vec4 sceneColor = texture(u_sceneTexture, vTexCoord);
        
        vec2 uv = vTexCoord * 2.0 - 1.0;
        float vignette = 1.0 - length(uv * u_roundness);
        vignette = pow(vignette, u_smoothness);
        vignette = clamp(vignette, 0.0, 1.0);
        
        vignette = mix(1.0, vignette, u_intensity);
        color = sceneColor * vignette;
    }
`;

const grainFragmentShader = `#version 300 es
    precision mediump float;
    
    in vec2 vTexCoord;
    uniform sampler2D u_sceneTexture;
    uniform float u_time;

    const float u_intensity = 0.5;
    const float u_grainSize = 2.0;
    
    out vec4 color;
    
    float random(vec2 seed) {
        return fract(sin(dot(seed, vec2(12.9898, 78.233))) * 43758.5453);
    }
    
    void main() {
        vec4 sceneColor = texture(u_sceneTexture, vTexCoord);
        
        vec2 grainCoord = (vTexCoord + u_time) * u_grainSize;
        float grain = random(grainCoord);
        vec3 grainyColor = sceneColor.rgb + (grain - 0.5) * u_intensity;
        
        color = vec4(grainyColor, sceneColor.a);
    }
`;

const bloomExtractFragmentShader = `#version 300 es
    precision mediump float;
    
    in vec2 vTexCoord;
    uniform sampler2D u_sceneTexture;
    const float threshold = 0.8;
    
    out vec4 color;
    
    void main() {
        vec4 sceneColor = texture(u_sceneTexture, vTexCoord);
        float brightness = dot(sceneColor.rgb, vec3(0.2126, 0.7152, 0.0722));
        
        if (brightness > threshold) {
            color = sceneColor;
        } else {
            color = vec4(0.0);
        }
    }
`;

const bloomBlurFragmentShader = `#version 300 es
    precision mediump float;
    
    in vec2 vTexCoord;
    uniform sampler2D u_sceneTexture;
    uniform vec2 u_direction;
    uniform vec2 u_texelSize;
    
    out vec4 color;
    
    void main() {
        vec4 result = vec4(0.0);
        float weights[5] = float[](0.227027, 0.1945946, 0.1216216, 0.054054, 0.016216);
        
        result += texture(u_sceneTexture, vTexCoord) * weights[0];
        
        for (int i = 1; i < 5; i++) {
            result += texture(u_sceneTexture, vTexCoord + u_direction * u_texelSize * float(i)) * weights[i];
            result += texture(u_sceneTexture, vTexCoord - u_direction * u_texelSize * float(i)) * weights[i];
        }
        
        color = result;
    }
`;

const bloomCombineFragmentShader = `#version 300 es
    precision mediump float;
    
    in vec2 vTexCoord;
    uniform sampler2D u_sceneTexture;
    uniform sampler2D u_bloomTexture;
    uniform float u_intensity;
    
    out vec4 color;
    
    void main() {
        vec4 sceneColor = texture(u_sceneTexture, vTexCoord);
        vec4 bloomColor = texture(u_bloomTexture, vTexCoord);
        color = sceneColor + bloomColor * u_intensity;
    }
`;

//------------------------------------------------

const depthVertexShaderSource = `#version 300 es
    precision mediump float;
    precision mediump int;

    layout (location = 0) in vec3 position;
    layout (location = 1) in vec2 texCoord;

    uniform struct Transform {
        mat4 model;
        mat4 viewProjection;
    } transform;

    void main() {
        gl_Position = transform.viewProjection * transform.model * vec4(position, 1.0);
    }
`;

const depthFragmentShaderSource = `#version 300 es
    precision highp float;
    
    uniform vec2 u_nearFar;
    out vec4 color;
    
    void main() {
        float z = gl_FragCoord.z;
        float linearDepth = (2.0 * u_nearFar.x) / (u_nearFar.y + u_nearFar.x - z * (u_nearFar.y - u_nearFar.x));
        color = vec4(linearDepth, linearDepth, linearDepth, 1.0);
    }
`;

const dofFragmentShader = `#version 300 es
    precision mediump float;
    
    in vec2 vTexCoord;
    uniform sampler2D u_image;
    uniform sampler2D u_depth;
    uniform vec2 u_resolution;
    uniform float u_focus;
    uniform float u_aperture;
    
    out vec4 color;
    
    float getBlurRadius(float depth) {
        return abs(depth - u_focus) * u_aperture * 10.0;
    }
    
    void main() {
        float depth = texture(u_depth, vTexCoord).r;
        float radius = getBlurRadius(depth);
        
        // Ограничиваем количество сэмплов для производительности
        int samples = 1 + int(radius * 16.0);
        samples = min(samples, 32);  // Максимум 32 сэмпла
        
        vec4 result = vec4(0.0);
        
        for (int i = 0; i < 32; i++) {
            if (i >= samples) break;
            
            float angle = float(i) * 6.28318 / float(samples);
            float r = sqrt(float(i) / float(samples)) * radius;
            vec2 offset = vec2(cos(angle), sin(angle)) * r / u_resolution;
            
            result += texture(u_image, vTexCoord + offset);
        }
        
        color = result / float(samples);
    }
`;

const colorGradingFragmentShader = `#version 300 es
    precision mediump float;
    precision mediump sampler3D;
    
    in vec2 vTexCoord;
    uniform sampler2D u_sceneTexture;
    uniform sampler3D u_lut;        // 3D текстура LUT
    uniform float u_intensity;       // Интенсивность эффекта (0-1)
    
    out vec4 color;
    
    void main() {
        vec4 sceneColor = texture(u_sceneTexture, vTexCoord);
        
        // Применяем LUT к цвету
        vec3 gradedColor = texture(u_lut, sceneColor.rgb).rgb;
        
        // Смешиваем исходный цвет с обработанным
        vec3 finalColor = mix(sceneColor.rgb, gradedColor, u_intensity);
        
        color = vec4(finalColor, sceneColor.a);
    }
`;

//------------------------------------------------

function checkWebGLerror() {
    let err;
    while ((err = gl.getError()) != gl.NO_ERROR) {
        console.log("Error! Code: " + err);
    }
}

function shaderLog(shader) {
    const infoLog = gl.getShaderInfoLog(shader);
    if (infoLog && infoLog.length > 0) {
        console.log("Shader info log:", infoLog);
    }
}

function releaseVBO() {
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    gl.deleteBuffer(VBO_cube);
    if (textureNumber) gl.deleteTexture(textureNumber);
    if (textureMaterial) gl.deleteTexture(textureMaterial);
}

function releaseShader() {
    gl.useProgram(null);
    gl.deleteProgram(program);
}

function release() {
    releaseShader();
    releaseVBO();
}

async function init() {
    initShaders();
    await initVBO();
    await initTextures();
    initFBO();

    gl.clearColor(0.0, 0.0, 0.0, 1.0);
    gl.clearDepth(1.0);
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.depthFunc(gl.LEQUAL);

    gl.depthMask(true);
    gl.clearDepth(1.0);


    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
}

let textureNumber1, textureNumber2, textureNumber3;
let textureMaterial1, textureMaterial2, textureMaterial3;
let textureSkull, textureBus;
let lutTexture;

async function initTextures() {
    textureNumber1 = gl.createTexture();
    textureNumber2 = gl.createTexture();
    textureNumber3 = gl.createTexture();
    textureMaterial1 = gl.createTexture();
    textureMaterial2 = gl.createTexture();
    textureMaterial3 = gl.createTexture();

    textureSkull = gl.createTexture();
    textureBus = gl.createTexture();

    await Promise.all([
        loadTexture(textureNumber1, textureNumber1Url),
        loadTexture(textureNumber2, textureNumber2Url),
        loadTexture(textureNumber3, textureNumber3Url),
        loadTexture(textureMaterial1, textureMaterial1Url),
        loadTexture(textureMaterial2, textureMaterial2Url),
        loadTexture(textureMaterial3, textureMaterial3Url),
        loadTexture(textureSkull, textureSkullURL),
        loadTexture(textureBus, textureBusURL)
    ]);

    lutTexture = create3DTexture(createSepiaLUT());
}

function loadTexture(textureObject, imageUrl) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        
        img.onload = () => {
            gl.bindTexture(gl.TEXTURE_2D, textureObject);
            
            gl.texImage2D(
                gl.TEXTURE_2D, 
                0, 
                gl.RGBA, 
                gl.RGBA, 
                gl.UNSIGNED_BYTE, 
                img
            );
            
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); // !!!!!!!!!!!!!!!!!!
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST); // !!!!!!!!!!!!!!!!!!
            
            gl.generateMipmap(gl.TEXTURE_2D);
            
            gl.bindTexture(gl.TEXTURE_2D, null);

            checkWebGLerror();
            resolve();
        };
        img.src = imageUrl;
    });
}

function create3DTexture(data, size = 32) {
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_3D, texture);
    
    gl.texImage3D(
        gl.TEXTURE_3D, 0, gl.RGBA, 
        size, size, size, 0,
        gl.RGBA, gl.UNSIGNED_BYTE, data
    );
    
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);
    
    gl.bindTexture(gl.TEXTURE_3D, null);
    
    return texture;
}

function createSepiaLUT(size = 32) {
    const data = new Uint8Array(size * size * size * 4);
    
    for (let r = 0; r < size; r++) {
        for (let g = 0; g < size; g++) {
            for (let b = 0; b < size; b++) {
                const index = (r * size * size + g * size + b) * 4;
                
                let r_in = r * 255 / (size - 1);
                let g_in = g * 255 / (size - 1);
                let b_in = b * 255 / (size - 1);
                
                // Конвертация в sepia
                let r_out = Math.min(255, r_in * 0.393 + g_in * 0.769 + b_in * 0.189);
                let g_out = Math.min(255, r_in * 0.349 + g_in * 0.686 + b_in * 0.168);
                let b_out = Math.min(255, r_in * 0.272 + g_in * 0.534 + b_in * 0.131);
                
                data[index] = r_out;
                data[index + 1] = g_out;
                data[index + 2] = b_out;
                data[index + 3] = 255;
            }
        }
    }
    
    return data;
}

async function readObj(obj) {
    const response = await fetch(obj);
    const objContent = await response.text();
    return objContent;
}

let cube, skull, bus;
async function initVBO() {
    VBO_cube = gl.createBuffer();
    VBO_skull = gl.createBuffer();
    VBO_bus = gl.createBuffer();

    cube = parseObjToVertexArray(await readObj(cubeOBJ));

    gl.bindBuffer(gl.ARRAY_BUFFER, VBO_cube);
    gl.bufferData(gl.ARRAY_BUFFER, cube, gl.STATIC_DRAW);

    skull = parseObjToVertexArray(await readObj(skullOBJ));

    gl.bindBuffer(gl.ARRAY_BUFFER, VBO_skull);
    gl.bufferData(gl.ARRAY_BUFFER, skull, gl.STATIC_DRAW);

    bus = parseObjToVertexArray(await readObj(busOBJ));

    gl.bindBuffer(gl.ARRAY_BUFFER, VBO_bus);
    gl.bufferData(gl.ARRAY_BUFFER, bus, gl.STATIC_DRAW);

    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    
    checkWebGLerror();
}

let FBO1, FBO2;
let frameTexture1, frameTexture2, tempTexture;

let FBO1_downsampled, FBO2_downsampled;
let downsampledTexture1, downsampledTexture2;
let downsample = 0.5;

let depthTexture;
let FBO_depth;

function initFBO() {
    FBO1 = gl.createFramebuffer();
    FBO2 = gl.createFramebuffer();
    FBO1_downsampled = gl.createFramebuffer();
    FBO2_downsampled = gl.createFramebuffer();

    //--------------------------------------------------

    const depthBuffer = gl.createRenderbuffer();
    gl.bindRenderbuffer(gl.RENDERBUFFER, depthBuffer);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, canvas.width, canvas.height);

    frameTexture1 = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, frameTexture1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, canvas.width, canvas.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    gl.bindFramebuffer(gl.FRAMEBUFFER, FBO1);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, frameTexture1, 0);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depthBuffer);


    frameTexture2 = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, frameTexture2);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, canvas.width, canvas.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    gl.bindFramebuffer(gl.FRAMEBUFFER, FBO2);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, frameTexture2, 0);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depthBuffer);

    //--------------------------------------------------

    const depthBufferDownsampled = gl.createRenderbuffer();
    gl.bindRenderbuffer(gl.RENDERBUFFER, depthBufferDownsampled);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, canvas.width * downsample, canvas.height * downsample);

    downsampledTexture1 = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, downsampledTexture1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, canvas.width * downsample, canvas.height * downsample, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    gl.bindFramebuffer(gl.FRAMEBUFFER, FBO1_downsampled);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, downsampledTexture1, 0);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depthBufferDownsampled);


    downsampledTexture2 = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, downsampledTexture2);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, canvas.width * downsample, canvas.height * downsample, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    gl.bindFramebuffer(gl.FRAMEBUFFER, FBO2_downsampled);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, downsampledTexture2, 0);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depthBufferDownsampled);

    //--------------------------------------------------

    FBO_depth = gl.createFramebuffer();
    
    depthTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, depthTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, canvas.width, canvas.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    
    // Добавляем depth renderbuffer
    const depthRB = gl.createRenderbuffer();
    gl.bindRenderbuffer(gl.RENDERBUFFER, depthRB);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, canvas.width, canvas.height);
    
    gl.bindFramebuffer(gl.FRAMEBUFFER, FBO_depth);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, depthTexture, 0);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depthRB);

    //--------------------------------------------------

    // Проверка на завершенность
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
        console.error('FBO incomplete!');
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    tempTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tempTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, canvas.width, canvas.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    checkWebGLerror();
}

function initShader(v, f){
    const vShader = gl.createShader(gl.VERTEX_SHADER);
    gl.shaderSource(vShader, v);
    gl.compileShader(vShader);
    console.log("vertex shader");
    shaderLog(vShader);
    
    const fShader = gl.createShader(gl.FRAGMENT_SHADER);
    gl.shaderSource(fShader, f);
    gl.compileShader(fShader);
    console.log("fragment shader");
    shaderLog(fShader);
    
    const res = gl.createProgram();
    gl.attachShader(res, vShader);
    gl.attachShader(res, fShader);
    gl.linkProgram(res);

    if (!gl.getProgramParameter(res, gl.LINK_STATUS)) {
        console.error('Program link error:', gl.getProgramInfoLog(res));
    }

    checkWebGLerror();
    return res;
}

let modelUniformID, 
    viewProjectionUniformID;

let baseColorUniformID,
    textureNumberUniformID, textureMaterialUniformID, 
    textureProportionUniformID;
let modelUniformID1, viewProjectionUniformID1,  textureUniformID;

let programDOF_u_image, 
    programDOF_u_depth, 
    programDOF_u_resolution, 
    programDOF_u_focus, 
    programDOF_u_aperture,
    programDepth_nearFar;

let modelUniformID_d, 
    viewProjectionUniformID_d;

let programOutput, programVignette, programGrain;
let programBloomExtract, programBloomBlur, programBloomCombine;
let programDepth, programDOF;
let programColorGrading;

function initShaders() {
    program = initShader(vertexShaderSource, fragmentShaderSource);

    modelUniformID = gl.getUniformLocation(program, 'transform.model');
    viewProjectionUniformID = gl.getUniformLocation(program, 'transform.viewProjection');
    
    baseColorUniformID = gl.getUniformLocation(program, 'baseColor');
    textureNumberUniformID = gl.getUniformLocation(program, 'textureNumber');
    textureMaterialUniformID = gl.getUniformLocation(program, 'textureMaterial');

    textureProportionUniformID = gl.getUniformLocation(program, 'textureProportion');

    program1 = initShader(vertexShaderSource, fragmentShaderSource1);
    textureUniformID = gl.getUniformLocation(program1, 'tex');
    modelUniformID1 = gl.getUniformLocation(program1, 'transform.model');
    viewProjectionUniformID1 = gl.getUniformLocation(program1, 'transform.viewProjection');

    //------------------------------------------------

    programOutput = initShader(fullscreenVertexShader, outputFragmentShader);
    programVignette = initShader(fullscreenVertexShader, vignetteFragmentShader);
    programGrain = initShader(fullscreenVertexShader, grainFragmentShader);

    programBloomExtract = initShader(fullscreenVertexShader, bloomExtractFragmentShader);
    programBloomBlur = initShader(fullscreenVertexShader, bloomBlurFragmentShader);
    programBloomCombine = initShader(fullscreenVertexShader, bloomCombineFragmentShader);

    //------------------------------------------------

    programDepth = initShader(depthVertexShaderSource, depthFragmentShaderSource);
    programDOF = initShader(fullscreenVertexShader, dofFragmentShader);

    programDOF_u_image = gl.getUniformLocation(programDOF, 'u_image');
    programDOF_u_depth = gl.getUniformLocation(programDOF, 'u_depth');
    programDOF_u_resolution = gl.getUniformLocation(programDOF, 'u_resolution');
    programDOF_u_focus = gl.getUniformLocation(programDOF, 'u_focus');
    programDOF_u_aperture = gl.getUniformLocation(programDOF, 'u_aperture');
    
    programDepth_nearFar = gl.getUniformLocation(programDepth, 'u_nearFar');
    modelUniformID_d = gl.getUniformLocation(programDepth, 'transform.model');
    viewProjectionUniformID_d = gl.getUniformLocation(programDepth, 'transform.viewProjection');

    programColorGrading = initShader(fullscreenVertexShader, colorGradingFragmentShader);
    
    checkWebGLerror();
}

function draw() {
    gl.bindFramebuffer(gl.FRAMEBUFFER, FBO1); 
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    gl.useProgram(program);

    const projection = mat4.create();
    const view = mat4.create();
    const viewProjection = mat4.create();
    let model = mat4.create();
    
    mat4.perspective(projection, 45.0 * Math.PI / 180, canvas.width / canvas.height, 0.1, 10.0);
    mat4.identity(view);
    mat4.translate(view, view, [-cameraPos[0], -cameraPos[1], -cameraPos[2]]);
    mat4.multiply(viewProjection, projection, view);

    gl.uniformMatrix4fv(viewProjectionUniformID, false, viewProjection);
    gl.uniform1f(textureProportionUniformID, textureProportion);
    gl.uniform1i(textureNumberUniformID, 0);
    gl.uniform1i(textureMaterialUniformID, 1);

    //------------------------------------------------------------------------

    model = mat4.create();
    mat4.rotate(model, model, rotation3, [0, 1, 0]);
    mat4.translate(model, model, podiumPosition);
    mat4.rotate(model, model, rotation2, [0, 1, 0]);
    mat4.translate(model, model, [0.0, 0.0, 0.0]);
    mat4.rotate(model, model, rotation1, [0, 1, 0]);
    mat4.scale(model, model, [1.0, 1.25, 1.0]);
    mat4.scale(model, model, [scale, scale, scale]);

    gl.uniformMatrix4fv(modelUniformID, false, model);

    gl.uniform3f(baseColorUniformID, 1.0, 1.0, 0.0);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, textureNumber1);
    
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, textureMaterial1);

    gl.bindBuffer(gl.ARRAY_BUFFER, VBO_cube);
    gl.enableVertexAttribArray(positionAttribID);
    gl.vertexAttribPointer(positionAttribID, 3, gl.FLOAT, false, 32, 0);
    gl.enableVertexAttribArray(texCoordAttribID);
    gl.vertexAttribPointer(texCoordAttribID, 2, gl.FLOAT, false, 32, 12);

    gl.drawArrays(gl.TRIANGLES, 0, cube.length / 8);

    //------------------------------------------------------------------------

    model = mat4.create();
    mat4.rotate(model, model, rotation3, [0, 1, 0]);
    mat4.translate(model, model, podiumPosition);
    mat4.rotate(model, model, rotation2, [0, 1, 0]);
    mat4.translate(model, model, [-2.0 * scale, - 2.0 * scale * 0.25 / 2, 0.0]);
    mat4.rotate(model, model, rotation1, [0, 1, 0]);
    mat4.scale(model, model, [1.0, 1.0, 1.0]);
    mat4.scale(model, model, [scale, scale, scale]);

    gl.uniformMatrix4fv(modelUniformID, false, model);

    gl.uniform3f(baseColorUniformID, 0.6, 0.6, 0.6);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, textureNumber2);
    
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, textureMaterial2);

    gl.bindBuffer(gl.ARRAY_BUFFER, VBO_cube);
    gl.enableVertexAttribArray(positionAttribID);
    gl.vertexAttribPointer(positionAttribID, 3, gl.FLOAT, false, 32, 0);
    gl.enableVertexAttribArray(texCoordAttribID);
    gl.vertexAttribPointer(texCoordAttribID, 2, gl.FLOAT, false, 32, 12);

    gl.drawArrays(gl.TRIANGLES, 0, cube.length / 8);

    //------------------------------------------------------------------------

    model = mat4.create();
    mat4.rotate(model, model, rotation3, [0, 1, 0]);
    mat4.translate(model, model, podiumPosition);
    mat4.rotate(model, model, rotation2, [0, 1, 0]);
    mat4.translate(model, model, [2.0 * scale, -2.0 * 0.25 * scale, 0.0]);
    mat4.rotate(model, model, rotation1, [0, 1, 0]);
    mat4.scale(model, model, [1.0, 0.75, 1.0]);
    mat4.scale(model, model, [scale, scale, scale]);

    gl.uniformMatrix4fv(modelUniformID, false, model);

    gl.uniform3f(baseColorUniformID, 0.6, 0.42, 0.3);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, textureNumber3);
    
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, textureMaterial3);

    gl.bindBuffer(gl.ARRAY_BUFFER, VBO_cube);
    gl.enableVertexAttribArray(positionAttribID);
    gl.vertexAttribPointer(positionAttribID, 3, gl.FLOAT, false, 32, 0);
    gl.enableVertexAttribArray(texCoordAttribID);
    gl.vertexAttribPointer(texCoordAttribID, 2, gl.FLOAT, false, 32, 12);

    gl.drawArrays(gl.TRIANGLES, 0, cube.length / 8);

    //------------------------------------------------------------------------

    gl.useProgram(program1);

    gl.uniformMatrix4fv(viewProjectionUniformID1, false, viewProjection);
    gl.uniform1i(textureUniformID, 0);

    model = mat4.create();
    
    mat4.translate(model, model, [-0.5, -0.5, 0.0]);
    mat4.rotate(model, model, rotation2, [0, 1, 0]);
    mat4.rotate(model, model, -Math.PI / 2, [1, 0, 0]);
    mat4.scale(model, model, [0.03, 0.03, 0.03]);

    gl.uniformMatrix4fv(modelUniformID1, false, model);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, textureSkull);

    gl.bindBuffer(gl.ARRAY_BUFFER, VBO_skull);
    gl.enableVertexAttribArray(positionAttribID);
    gl.vertexAttribPointer(positionAttribID, 3, gl.FLOAT, false, 32, 0);
    gl.enableVertexAttribArray(texCoordAttribID);
    gl.vertexAttribPointer(texCoordAttribID, 2, gl.FLOAT, false, 32, 12);

    gl.drawArrays(gl.TRIANGLES, 0, skull.length / 8);

    //------------------------------------------------------------------------

    gl.useProgram(program1);

    gl.uniformMatrix4fv(viewProjectionUniformID1, false, viewProjection);
    gl.uniform1i(textureUniformID, 0);

    model = mat4.create();
    
    mat4.translate(model, model, [0.5, -0.5, 0.0]);
    mat4.rotate(model, model, rotation2, [0, 1, 0]);
    mat4.rotate(model, model, Math.PI, [0, 1, 0]);
    mat4.rotate(model, model, 0, [1, 0, 0]);
    mat4.scale(model, model, [0.07, 0.07, 0.07]);

    gl.uniformMatrix4fv(modelUniformID1, false, model);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, textureBus);

    gl.bindBuffer(gl.ARRAY_BUFFER, VBO_bus);
    gl.enableVertexAttribArray(positionAttribID);
    gl.vertexAttribPointer(positionAttribID, 3, gl.FLOAT, false, 32, 0);
    gl.enableVertexAttribArray(texCoordAttribID);
    gl.vertexAttribPointer(texCoordAttribID, 2, gl.FLOAT, false, 32, 12);

    gl.drawArrays(gl.TRIANGLES, 0, bus.length / 8);

    //------------------------------------------------------------------------

    gl.disableVertexAttribArray(positionAttribID);
    gl.disableVertexAttribArray(texCoordAttribID);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    
    gl.bindTexture(gl.TEXTURE_2D, null);
    
    gl.useProgram(null);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    
    checkWebGLerror();
}

function renderDepth() {
    gl.bindFramebuffer(gl.FRAMEBUFFER, FBO_depth);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    
    gl.useProgram(programDepth);
    
    // Передаем near/far плоскости
    gl.uniform2f(programDepth_nearFar, 0.1, 10);
    
    // Та же матрица проекции, что и в draw()
    const projection = mat4.create();
    const view = mat4.create();
    const viewProjection = mat4.create();
    
    mat4.perspective(projection, 45.0 * Math.PI / 180, canvas.width / canvas.height, 0.1, 10.0);
    mat4.identity(view);
    mat4.translate(view, view, [-cameraPos[0], -cameraPos[1], -cameraPos[2]]);
    mat4.multiply(viewProjection, projection, view);

    gl.uniformMatrix4fv(viewProjectionUniformID_d, false, viewProjection);
    
    let model = mat4.create();
    mat4.rotate(model, model, rotation3, [0, 1, 0]);
    mat4.translate(model, model, podiumPosition);
    mat4.rotate(model, model, rotation2, [0, 1, 0]);
    mat4.translate(model, model, [0.0, 0.0, 0.0]);
    mat4.rotate(model, model, rotation1, [0, 1, 0]);
    mat4.scale(model, model, [1.0, 1.25, 1.0]);
    mat4.scale(model, model, [scale, scale, scale]);

    gl.uniformMatrix4fv(modelUniformID_d, false, model);

    // gl.uniform3f(baseColorUniformID, 1.0, 1.0, 0.0);

    // gl.activeTexture(gl.TEXTURE0);
    // gl.bindTexture(gl.TEXTURE_2D, textureNumber1);
    
    // gl.activeTexture(gl.TEXTURE1);
    // gl.bindTexture(gl.TEXTURE_2D, textureMaterial1);

    gl.bindBuffer(gl.ARRAY_BUFFER, VBO_cube);
    gl.enableVertexAttribArray(positionAttribID);
    gl.vertexAttribPointer(positionAttribID, 3, gl.FLOAT, false, 32, 0);
    gl.enableVertexAttribArray(texCoordAttribID);
    gl.vertexAttribPointer(texCoordAttribID, 2, gl.FLOAT, false, 32, 12);

    gl.drawArrays(gl.TRIANGLES, 0, cube.length / 8);

    //------------------------------------------------------------------------

    model = mat4.create();
    mat4.rotate(model, model, rotation3, [0, 1, 0]);
    mat4.translate(model, model, podiumPosition);
    mat4.rotate(model, model, rotation2, [0, 1, 0]);
    mat4.translate(model, model, [-2.0 * scale, - 2.0 * scale * 0.25 / 2, 0.0]);
    mat4.rotate(model, model, rotation1, [0, 1, 0]);
    mat4.scale(model, model, [1.0, 1.0, 1.0]);
    mat4.scale(model, model, [scale, scale, scale]);

    gl.uniformMatrix4fv(modelUniformID_d, false, model);

    // gl.uniform3f(baseColorUniformID, 0.6, 0.6, 0.6);

    // gl.activeTexture(gl.TEXTURE0);
    // gl.bindTexture(gl.TEXTURE_2D, textureNumber2);
    
    // gl.activeTexture(gl.TEXTURE1);
    // gl.bindTexture(gl.TEXTURE_2D, textureMaterial2);

    gl.bindBuffer(gl.ARRAY_BUFFER, VBO_cube);
    gl.enableVertexAttribArray(positionAttribID);
    gl.vertexAttribPointer(positionAttribID, 3, gl.FLOAT, false, 32, 0);
    gl.enableVertexAttribArray(texCoordAttribID);
    gl.vertexAttribPointer(texCoordAttribID, 2, gl.FLOAT, false, 32, 12);

    gl.drawArrays(gl.TRIANGLES, 0, cube.length / 8);

    //------------------------------------------------------------------------

    model = mat4.create();
    mat4.rotate(model, model, rotation3, [0, 1, 0]);
    mat4.translate(model, model, podiumPosition);
    mat4.rotate(model, model, rotation2, [0, 1, 0]);
    mat4.translate(model, model, [2.0 * scale, -2.0 * 0.25 * scale, 0.0]);
    mat4.rotate(model, model, rotation1, [0, 1, 0]);
    mat4.scale(model, model, [1.0, 0.75, 1.0]);
    mat4.scale(model, model, [scale, scale, scale]);

    gl.uniformMatrix4fv(modelUniformID_d, false, model);

    // gl.uniform3f(baseColorUniformID, 0.6, 0.42, 0.3);

    // gl.activeTexture(gl.TEXTURE0);
    // gl.bindTexture(gl.TEXTURE_2D, textureNumber3);
    
    // gl.activeTexture(gl.TEXTURE1);
    // gl.bindTexture(gl.TEXTURE_2D, textureMaterial3);

    gl.bindBuffer(gl.ARRAY_BUFFER, VBO_cube);
    gl.enableVertexAttribArray(positionAttribID);
    gl.vertexAttribPointer(positionAttribID, 3, gl.FLOAT, false, 32, 0);
    gl.enableVertexAttribArray(texCoordAttribID);
    gl.vertexAttribPointer(texCoordAttribID, 2, gl.FLOAT, false, 32, 12);

    gl.drawArrays(gl.TRIANGLES, 0, cube.length / 8);

    //------------------------------------------------------------------------

    // gl.useProgram(program1);

    // gl.uniformMatrix4fv(viewProjectionUniformID1, false, viewProjection);
    // gl.uniform1i(textureUniformID, 0);

    model = mat4.create();
    
    mat4.translate(model, model, [-0.5, -0.5, 0.0]);
    mat4.rotate(model, model, rotation2, [0, 1, 0]);
    mat4.rotate(model, model, -Math.PI / 2, [1, 0, 0]);
    mat4.scale(model, model, [0.03, 0.03, 0.03]);

    gl.uniformMatrix4fv(modelUniformID_d, false, model);

    // gl.activeTexture(gl.TEXTURE0);
    // gl.bindTexture(gl.TEXTURE_2D, textureSkull);

    gl.bindBuffer(gl.ARRAY_BUFFER, VBO_skull);
    gl.enableVertexAttribArray(positionAttribID);
    gl.vertexAttribPointer(positionAttribID, 3, gl.FLOAT, false, 32, 0);
    gl.enableVertexAttribArray(texCoordAttribID);
    gl.vertexAttribPointer(texCoordAttribID, 2, gl.FLOAT, false, 32, 12);

    gl.drawArrays(gl.TRIANGLES, 0, skull.length / 8);

    //------------------------------------------------------------------------


    // gl.uniformMatrix4fv(viewProjectionUniformID1, false, viewProjection);
    // gl.uniform1i(textureUniformID, 0);

    model = mat4.create();
    
    mat4.translate(model, model, [0.5, -0.5, 0.0]);
    mat4.rotate(model, model, rotation2, [0, 1, 0]);
    mat4.rotate(model, model, Math.PI, [0, 1, 0]);
    mat4.rotate(model, model, 0, [1, 0, 0]);
    mat4.scale(model, model, [0.07, 0.07, 0.07]);

    gl.uniformMatrix4fv(modelUniformID_d, false, model);

    // gl.activeTexture(gl.TEXTURE0);
    // gl.bindTexture(gl.TEXTURE_2D, textureBus);

    gl.bindBuffer(gl.ARRAY_BUFFER, VBO_bus);
    gl.enableVertexAttribArray(positionAttribID);
    gl.vertexAttribPointer(positionAttribID, 3, gl.FLOAT, false, 32, 0);
    gl.enableVertexAttribArray(texCoordAttribID);
    gl.vertexAttribPointer(texCoordAttribID, 2, gl.FLOAT, false, 32, 12);

    gl.drawArrays(gl.TRIANGLES, 0, bus.length / 8);

    //------------------------------------------------------------------------

    gl.disableVertexAttribArray(positionAttribID);
    gl.disableVertexAttribArray(texCoordAttribID);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    
    gl.bindTexture(gl.TEXTURE_2D, null);
    
    gl.useProgram(null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    checkWebGLerror();
}

let readFBO, writeFBO, readTexture, writeTexture;
let vignette = false;
let grain = false;
let bloom = false;

let depthOfField = false;
let u_focus = 0.2;
let u_aperture = 0.8;

let colorGrading = false;

function postprocess(){
    readFBO = FBO1;
    writeFBO = FBO2;
    readTexture = frameTexture1;
    writeTexture = frameTexture2;

    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    
    if (colorGrading) applyColorGrading();
    if (depthOfField) applyDOF();
    if (vignette) applyVignette();
    if (grain) applyGrain();
    if (bloom) applyBloom();
    

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.useProgram(programOutput);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, readTexture);
    gl.uniform1i(gl.getUniformLocation(programOutput, 'u_sceneTexture'), 0);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    

    

    gl.useProgram(null);

    checkWebGLerror();
}

function applyDownsampling(){
    gl.viewport(0, 0, canvas.width * downsample, canvas.height * downsample);

    gl.bindFramebuffer(gl.FRAMEBUFFER, FBO1_downsampled);

    gl.useProgram(programOutput);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, readTexture);
    gl.uniform1i(gl.getUniformLocation(programOutput, 'u_sceneTexture'), 0);

    gl.drawArrays(gl.TRIANGLES, 0, 6);

    [readTexture, writeTexture] = [downsampledTexture1, downsampledTexture2];
    [writeFBO, readFBO] = [FBO2_downsampled, FBO1_downsampled];
}

function applyUpsampling(){
    gl.viewport(0, 0, canvas.width, canvas.height);

    gl.bindFramebuffer(gl.FRAMEBUFFER, FBO1);

    gl.useProgram(programOutput);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, readTexture);
    gl.uniform1i(gl.getUniformLocation(programOutput, 'u_sceneTexture'), 0);

    gl.drawArrays(gl.TRIANGLES, 0, 6);

    [readTexture, writeTexture] = [frameTexture1, frameTexture2];
    [writeFBO, readFBO] = [FBO2, FBO1];
}

function applyVignette(){
    gl.bindFramebuffer(gl.FRAMEBUFFER, writeFBO);

    gl.useProgram(programVignette);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, readTexture);
    gl.uniform1i(gl.getUniformLocation(programVignette, 'u_sceneTexture'), 0);

    gl.drawArrays(gl.TRIANGLES, 0, 6);

    [readTexture, writeTexture] = [writeTexture, readTexture];
    [writeFBO, readFBO] = [readFBO, writeFBO];
}

function applyGrain(){
    gl.bindFramebuffer(gl.FRAMEBUFFER, writeFBO);
    
    gl.useProgram(programGrain);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, readTexture);
    gl.uniform1i(gl.getUniformLocation(programGrain, 'u_sceneTexture'), 0);
    gl.uniform1f(gl.getUniformLocation(programGrain, 'u_time'), (performance.now() - startTime) / 1000);

    gl.drawArrays(gl.TRIANGLES, 0, 6);

    [readTexture, writeTexture] = [writeTexture, readTexture];
    [writeFBO, readFBO] = [readFBO, writeFBO];
}

function applyBloom(){
    // Нужно ориг скопировать
    gl.bindFramebuffer(gl.FRAMEBUFFER, writeFBO);
    gl.useProgram(programOutput);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, readTexture);
    gl.uniform1i(gl.getUniformLocation(programOutput, 'u_sceneTexture'), 0);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    
    gl.bindTexture(gl.TEXTURE_2D, tempTexture);
    gl.copyTexImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 0, 0, canvas.width, canvas.height, 0);

    // Дальше - как обычно
    gl.bindFramebuffer(gl.FRAMEBUFFER, writeFBO);

    gl.useProgram(programBloomExtract);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, readTexture);
    gl.uniform1i(gl.getUniformLocation(programBloomExtract, 'u_sceneTexture'), 0);

    gl.drawArrays(gl.TRIANGLES, 0, 6);

    [readTexture, writeTexture] = [writeTexture, readTexture];
    [writeFBO, readFBO] = [readFBO, writeFBO];


    applyDownsampling();


    gl.bindFramebuffer(gl.FRAMEBUFFER, writeFBO);

    gl.useProgram(programBloomBlur);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, readTexture);
    gl.uniform1i(gl.getUniformLocation(programBloomBlur, 'u_sceneTexture'), 0);
    gl.uniform2f(gl.getUniformLocation(programBloomBlur, 'u_direction'), 1.0, 0.0);
    gl.uniform2f(gl.getUniformLocation(programBloomBlur, 'u_texelSize'), 1 / canvas.width, 1 / canvas.height);

    gl.drawArrays(gl.TRIANGLES, 0, 6);

    [readTexture, writeTexture] = [writeTexture, readTexture];
    [writeFBO, readFBO] = [readFBO, writeFBO];

    gl.bindFramebuffer(gl.FRAMEBUFFER, writeFBO);

    gl.useProgram(programBloomBlur);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, readTexture);
    gl.uniform1i(gl.getUniformLocation(programBloomBlur, 'u_sceneTexture'), 0);
    gl.uniform2f(gl.getUniformLocation(programBloomBlur, 'u_direction'), 0.0, 1.0);
    gl.uniform2f(gl.getUniformLocation(programBloomBlur, 'u_texelSize'), 1 / canvas.width, 1 / canvas.height);

    gl.drawArrays(gl.TRIANGLES, 0, 6);

    [readTexture, writeTexture] = [writeTexture, readTexture];
    [writeFBO, readFBO] = [readFBO, writeFBO];


    applyUpsampling();


    gl.bindFramebuffer(gl.FRAMEBUFFER, writeFBO);

    gl.useProgram(programBloomCombine);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tempTexture);
    gl.uniform1i(gl.getUniformLocation(programBloomCombine, 'u_sceneTexture'), 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, readTexture);
    gl.uniform1i(gl.getUniformLocation(programBloomCombine, 'u_bloomTexture'), 1);

    gl.uniform1f(gl.getUniformLocation(programBloomCombine, 'u_intensity'), 0.5 * (0.5 + 0.5 * Math.sin((performance.now() - startTime) / 2000 * Math.PI * 2)));

    gl.drawArrays(gl.TRIANGLES, 0, 6);

    [readTexture, writeTexture] = [writeTexture, readTexture];
    [writeFBO, readFBO] = [readFBO, writeFBO];
}

function applyDOF() {
    renderDepth();

    gl.bindFramebuffer(gl.FRAMEBUFFER, writeFBO);
    gl.viewport(0, 0, canvas.width, canvas.height);
    
    gl.useProgram(programDOF);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, readTexture);
    gl.uniform1i(programDOF_u_image, 0);
    
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, depthTexture);
    gl.uniform1i(programDOF_u_depth, 1);
    
    gl.uniform2f(programDOF_u_resolution, canvas.width, canvas.height);
    gl.uniform1f(programDOF_u_focus, u_focus);
    gl.uniform1f(programDOF_u_aperture, u_aperture);
    
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    
    [readTexture, writeTexture] = [writeTexture, readTexture];
    [writeFBO, readFBO] = [readFBO, writeFBO];
}

let colorGradingIntensity = 0.5;
function applyColorGrading(){
    gl.bindFramebuffer(gl.FRAMEBUFFER, writeFBO);
    
    gl.useProgram(programColorGrading);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, readTexture);
    gl.uniform1i(gl.getUniformLocation(programColorGrading, 'u_sceneTexture'), 0);
    
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_3D, lutTexture);
    gl.uniform1i(gl.getUniformLocation(programColorGrading, 'u_lut'), 1);
    
    gl.uniform1f(gl.getUniformLocation(programColorGrading, 'u_intensity'), colorGradingIntensity);
    
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    
    [readTexture, writeTexture] = [writeTexture, readTexture];
    [writeFBO, readFBO] = [readFBO, writeFBO];
}

function handleKeyboard() {
    if (keysPressed['Digit1']) {
        vignette = !vignette;
        keysPressed['Digit1'] = false;
    }

    if (keysPressed['Digit2']) {
        grain = !grain;
        keysPressed['Digit2'] = false;
    }

    if (keysPressed['Digit3']) {
        bloom = !bloom;
        keysPressed['Digit3'] = false;
    }

    if (keysPressed['Digit4']) {
        depthOfField = !depthOfField;
        keysPressed['Digit4'] = false;
    }

    if (keysPressed['Digit5']) {
        colorGrading = !colorGrading;
        keysPressed['Digit5'] = false;
    }

    if (keysPressed['KeyQ']) {
        rotation1 += 0.01;
    }

    if (keysPressed['KeyW']) {
       rotation2 += 0.01;
    }

    if (keysPressed['KeyE']) {
        rotation3 += 0.01;
    }

    if (keysPressed['ArrowLeft']) {
        textureProportion -= 0.01;
        if (textureProportion < 0) textureProportion = 0;
    }

    if (keysPressed['ArrowRight']) {
        textureProportion += 0.01;
        if (textureProportion > 1) textureProportion = 1;
    }
}

const keysPressed = {};
document.addEventListener('keydown', (event) => {
    keysPressed[event.code] = true;
    if (event.code.startsWith('Digit') || event.code.startsWith('Arrow')) {
        event.preventDefault();
    }
});

document.addEventListener('keyup', (event) => {
    keysPressed[event.code] = false;
});

async function setup() {
    await init();
    startTime = performance.now();

    function animate() {
        handleKeyboard();
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        draw();
        postprocess();
        requestAnimationFrame(animate);
    }
    
    animate();
}

function parseObjToVertexArray(objContent) {
    const positions = [];
    const texcoords = [];
    const normals = [];
    const result = [];
    const lines = objContent.split('\n');
    const faces = [];
    
    lines.forEach(line => {
        line = line.trim();
        if (line.startsWith('v ')) {
            const parts = line.split(/\s+/);
            positions.push(
                parseFloat(parts[1]),
                parseFloat(parts[2]),
                parseFloat(parts[3])
            );
        }
        else if (line.startsWith('vt ')) {
            const parts = line.split(/\s+/);
            texcoords.push(
                parseFloat(parts[1]),
                parseFloat(parts[2])
            );
        }
        else if (line.startsWith('vn ')) {
            const parts = line.split(/\s+/);
            normals.push(
                parseFloat(parts[1]),
                parseFloat(parts[2]),
                parseFloat(parts[3])
            );
        }
        else if (line.startsWith('f ')) {
            const parts = line.split(/\s+/);
            const faceIndices = [];
            
            for (let i = 1; i < parts.length; i++) {
                const indices = parts[i].split('/');
                faceIndices.push({
                    position: parseInt(indices[0]) - 1,
                    texcoord: indices[1] ? parseInt(indices[1]) - 1 : -1,
                    normal: indices[2] ? parseInt(indices[2]) - 1 : -1
                });
            }
            
            for (let i = 1; i < faceIndices.length - 1; i++) {
                faces.push([faceIndices[0], faceIndices[i], faceIndices[i + 1]]);
            }
        }
    });
    
    faces.forEach(triangle => {
        triangle.forEach(vertex => {
            if (vertex.position >= 0) {
                result.push(positions[vertex.position * 3]);
                result.push(positions[vertex.position * 3 + 1]);
                result.push(positions[vertex.position * 3 + 2]);
            } else {
                result.push(0, 0, 0);
            }
            
            if (vertex.texcoord >= 0 && texcoords.length > 0) {
                result.push(texcoords[vertex.texcoord * 2]);
                result.push(texcoords[vertex.texcoord * 2 + 1]);
            } else {
                result.push(0, 0);
            }
            
            if (vertex.normal >= 0 && normals.length > 0) {
                result.push(normals[vertex.normal * 3]);
                result.push(normals[vertex.normal * 3 + 1]);
                result.push(normals[vertex.normal * 3 + 2]);
            } else {
                result.push(0, 0, 1);
            }
        });
    });
    
    return new Float32Array(result);
}