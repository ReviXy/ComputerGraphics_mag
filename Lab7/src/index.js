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

let textureProportion = 0.5, colorProportion = 0.5;

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
    uniform float colorProportion;

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
    precision mediump int;

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
    const float u_intensity = 0.2;
    const float u_grainSize = 2.0;
    
    out vec4 color;
    
    float random(vec2 seed) {
        return fract(sin(dot(seed, vec2(12.9898, 78.233))) * 43758.5453);
    }
    
    void main() {
        vec4 sceneColor = texture(u_sceneTexture, vTexCoord);
        
        vec2 grainCoord = vTexCoord * u_grainSize;
        float grain = random(grainCoord);
        vec3 grainyColor = sceneColor.rgb + (grain - 0.5) * u_intensity;
        
        color = vec4(grainyColor, sceneColor.a);
    }
`;

const bloomExtractFragmentShader = `#version 300 es
    precision mediump float;
    
    in vec2 vTexCoord;
    uniform sampler2D u_sceneTexture;
    const float threshold = 0.5;
    
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
    const float intensity = 0.5;
    
    out vec4 color;
    
    void main() {
        vec4 sceneColor = texture(u_sceneTexture, vTexCoord);
        vec4 bloomColor = texture(u_bloomTexture, vTexCoord);
        color = sceneColor + bloomColor * intensity;
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


    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
}

let textureNumber1, textureNumber2, textureNumber3;
let textureMaterial1, textureMaterial2, textureMaterial3;
let textureSkull, textureBus;

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
function initFBO() {
    FBO1 = gl.createFramebuffer();
    FBO2 = gl.createFramebuffer();

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

    // Прикрепляем текстуру к FBO
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

    // Прикрепляем текстуру к FBO
    gl.bindFramebuffer(gl.FRAMEBUFFER, FBO2);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, frameTexture2, 0);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depthBuffer);

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
    textureProportionUniformID, colorProportionUniformID;
let modelUniformID1, viewProjectionUniformID1,  textureUniformID;

let programOutput, programVignette, programGrain;
let programBloomExtract, programBloomBlur, programBloomCombine;

function initShaders() {
    program = initShader(vertexShaderSource, fragmentShaderSource);

    modelUniformID = gl.getUniformLocation(program, 'transform.model');
    viewProjectionUniformID = gl.getUniformLocation(program, 'transform.viewProjection');
    
    baseColorUniformID = gl.getUniformLocation(program, 'baseColor');
    textureNumberUniformID = gl.getUniformLocation(program, 'textureNumber');
    textureMaterialUniformID = gl.getUniformLocation(program, 'textureMaterial');

    textureProportionUniformID = gl.getUniformLocation(program, 'textureProportion');
    colorProportionUniformID = gl.getUniformLocation(program, 'colorProportion');

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
    
    mat4.perspective(projection, 45.0 * Math.PI / 180, canvas.width / canvas.height, 0.1, 100.0);
    mat4.identity(view);
    mat4.translate(view, view, [-cameraPos[0], -cameraPos[1], -cameraPos[2]]);
    mat4.multiply(viewProjection, projection, view);

    gl.uniformMatrix4fv(viewProjectionUniformID, false, viewProjection);
    gl.uniform1f(textureProportionUniformID, textureProportion);
    gl.uniform1f(colorProportionUniformID, colorProportion);
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

let readFBO, writeFBO, readTexture, writeTexture;
let vignette = false;
let grain = false;
let bloom = false;

function postprocess(){
    readFBO = FBO1;
    writeFBO = FBO2;
    readTexture = frameTexture1;
    writeTexture = frameTexture2;

    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    
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

    gl.bindFramebuffer(gl.FRAMEBUFFER, writeFBO);

    gl.useProgram(programBloomCombine);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tempTexture);
    gl.uniform1i(gl.getUniformLocation(programBloomCombine, 'u_sceneTexture'), 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, readTexture);
    gl.uniform1i(gl.getUniformLocation(programBloomCombine, 'u_bloomTexture'), 1);

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