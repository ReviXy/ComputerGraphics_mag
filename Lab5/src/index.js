import { vec3, mat4, mat3 } from 'gl-matrix';
import sphereOBJ from './sphere.obj';
import cubeOBJ from './Buddha_Statue.obj'

import orangeTextureUrl from 'url:./orange.png';
import heightMapUrl from 'url:./heightMap.png';

import tilesTextureUrl from 'url:./Buddha_Statue_BaseColor.png';
import normalMapUrl from 'url:./Buddha_Statue_Normal.png';

document.addEventListener('DOMContentLoaded', setup);

const canvas = document.getElementById('canvas');
const gl = canvas.getContext('webgl2');
gl.viewport(0, 0, canvas.width, canvas.height);

const cameraPos = [0.0, 0.0, 5.0];
const lightPos = [5.0, 0.0, 5.0, 0.0];

let rotation1 = 0.0;
let rotation2 = 0.0;
let rotation3 = 0.0;
let scale = 0.5;

let VBO_sphere, VBO_cube;
let program, program1;
let positionAttribID = 0, texCoordAttribID = 1, normalAttribID = 2, tangentAttribID = 3, bitangentAttribID = 4;
let startTime;

const vertexShaderSource = `#version 300 es
    precision mediump float;
    precision mediump int;

    layout (location = 0) in vec3 position;
    layout (location = 1) in vec2 texCoord;
    layout (location = 2) in vec3 normal;
    layout (location = 3) in vec3 tangent;
    layout (location = 4) in vec3 bitangent;

    uniform struct Transform {
        mat4 model;
        mat4 viewProjection;
        mat3 normal;
        vec3 viewPosition;
    } transform;

    uniform struct PointLight {
        vec4 position;
        vec4 ambient;
        vec4 diffuse;
        vec4 specular;
    } pointLight;

    out struct Vertex {
        vec2 texCoord;
        vec3 tangentLightDir;
        vec3 tangentViewDir;
    } vert;

    void main() {
        vec4 vertex = transform.model * vec4(position, 1.0);
        gl_Position = transform.viewProjection * vertex;
        vert.texCoord = vec2(texCoord.x, 1.0f - texCoord.y);

        vec3 T = normalize(vec3(transform.model * vec4(tangent, 0.0)));
        vec3 B = normalize(vec3(transform.model * vec4(bitangent, 0.0)));
        vec3 N = normalize(vec3(transform.model * vec4(normal, 0.0)));
        
        mat3 TBN = transpose(mat3(T, B, N));

        vec3 lightDir = vec3(pointLight.position - vertex);
        float distance = length(lightDir);
        lightDir = normalize(lightDir);
        
        vec3 viewDir = normalize(transform.viewPosition - vec3(vertex));
        
        vert.tangentLightDir = TBN * lightDir;
        vert.tangentViewDir = TBN * viewDir;
    }
`;

const fragmentShaderSource = `#version 300 es
    precision mediump float;
    precision mediump int;

    in struct Vertex {
        vec2 texCoord;
        vec3 tangentLightDir;
        vec3 tangentViewDir;
    } vert;

    uniform struct PointLight {
        vec4 position;
        vec4 ambient;
        vec4 diffuse;
        vec4 specular;
    } pointLight;

    uniform sampler2D textureSampler;
    uniform sampler2D heightMap;
    uniform vec2 texelSize;

    out vec4 color;

    void main() {
        float heightCenter = texture(heightMap, vert.texCoord).r;
        float heightLeft = texture(heightMap, vert.texCoord + vec2(-texelSize.x, 0.0)).r;
        float heightRight = texture(heightMap, vert.texCoord + vec2(texelSize.x, 0.0)).r;
        float heightDown = texture(heightMap, vert.texCoord + vec2(0.0, -texelSize.y)).r;
        float heightUp = texture(heightMap, vert.texCoord + vec2(0.0, texelSize.y)).r;

        float x_gradient = heightLeft - heightRight;
        float y_gradient = heightDown - heightUp;
        
        float bumpStrength = 1.0;
        vec3 normal = normalize(vec3(x_gradient * bumpStrength, y_gradient * bumpStrength, 1.0));


        vec3 lightDir = normalize(vert.tangentLightDir);
        vec3 viewDir = normalize(vert.tangentViewDir);

        color = pointLight.ambient;
        
        float NdotL = max(dot(normal, lightDir), 0.0);
        color += pointLight.diffuse * NdotL;
        
        if (NdotL > 0.0) {
            float NdotV = max(dot(reflect(lightDir, normal), viewDir), 0.0);
            float shininess = 32.0;
            float specularPower = pow(NdotV, shininess);
            color += pointLight.specular * specularPower;
        }   

        color *= texture(textureSampler, vert.texCoord);
    }
`;

const fragmentShaderSource1 = `#version 300 es
    precision mediump float;
    precision mediump int;

    in struct Vertex {
        vec2 texCoord;
        vec3 tangentLightDir;
        vec3 tangentViewDir;
    } vert;

    uniform struct PointLight {
        vec4 position;
        vec4 ambient;
        vec4 diffuse;
        vec4 specular;
    } pointLight;

    uniform sampler2D textureSampler;
    uniform sampler2D normalMap;

    out vec4 color;

    void main() {
        vec3 normal = texture(normalMap, vert.texCoord).rgb;
        normal = normal * 2.0 - 1.0;
        normal = normalize(normal);


        vec3 lightDir = normalize(vert.tangentLightDir);
        vec3 viewDir = normalize(vert.tangentViewDir);

        color = pointLight.ambient;
        
        float NdotL = max(dot(normal, lightDir), 0.0);
        color += pointLight.diffuse * NdotL;
        
        if (NdotL > 0.0) {
            float NdotV = max(dot(reflect(lightDir, normal), viewDir), 0.0);
            float shininess = 32.0;
            float specularPower = pow(NdotV, shininess);
            color += pointLight.specular * specularPower;
        }   

        color *= texture(textureSampler, vert.texCoord);
    }
`;




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

    gl.clearColor(0.0, 0.0, 0.0, 1.0);
    gl.clearDepth(1.0);
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.depthFunc(gl.LEQUAL);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
}

let orangeTexture;
let heightMap;
let tilesTexture;
let normalMap;

async function initTextures() {
    orangeTexture = gl.createTexture();
    heightMap = gl.createTexture();
    tilesTexture = gl.createTexture();
    normalMap = gl.createTexture();

    await Promise.all([
        loadTexture(orangeTexture, orangeTextureUrl),
        loadTexture(heightMap, heightMapUrl),
        loadTexture(tilesTexture, tilesTextureUrl),
        loadTexture(normalMap, normalMapUrl)
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

let sphere;
let cube;
async function initVBO() {
    VBO_sphere = gl.createBuffer();
    VBO_cube = gl.createBuffer();

    sphere = parseObjToVertexArray(await readObj(sphereOBJ));
    gl.bindBuffer(gl.ARRAY_BUFFER, VBO_sphere);
    gl.bufferData(gl.ARRAY_BUFFER, sphere, gl.STATIC_DRAW);

    cube = parseObjToVertexArray(await readObj(cubeOBJ));
    gl.bindBuffer(gl.ARRAY_BUFFER, VBO_cube);
    gl.bufferData(gl.ARRAY_BUFFER, cube, gl.STATIC_DRAW);

    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    
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
    viewProjectionUniformID,
    normalUniformID,
    viewPositionUniformID;

let pointLightPositionUniformID,
    pointLightAmbientUniformID,
    pointLightDiffuseUniformID,
    pointLightSpecularUniformID;

let textureSamplerUniformID,
    heightMapUniformID,
    texelSizeUniformID;


let modelUniformID1, 
    viewProjectionUniformID1,
    normalUniformID1,
    viewPositionUniformID1;

let pointLightPositionUniformID1,
    pointLightAmbientUniformID1,
    pointLightDiffuseUniformID1,
    pointLightSpecularUniformID1;

let textureSamplerUniformID1,
    normalMapUniformID1;

function initShaders() {
    program = initShader(vertexShaderSource, fragmentShaderSource);

    modelUniformID = gl.getUniformLocation(program, 'transform.model');
    viewProjectionUniformID = gl.getUniformLocation(program, 'transform.viewProjection');
    normalUniformID = gl.getUniformLocation(program, 'transform.normal');
    viewPositionUniformID = gl.getUniformLocation(program, 'transform.viewPosition');

    pointLightPositionUniformID = gl.getUniformLocation(program, 'pointLight.position');
    pointLightAmbientUniformID = gl.getUniformLocation(program, 'pointLight.ambient');
    pointLightDiffuseUniformID = gl.getUniformLocation(program, 'pointLight.diffuse');
    pointLightSpecularUniformID = gl.getUniformLocation(program, 'pointLight.specular');

    textureSamplerUniformID = gl.getUniformLocation(program, 'textureSampler');
    heightMapUniformID = gl.getUniformLocation(program, 'heightMap');
    texelSizeUniformID = gl.getUniformLocation(program, 'texelSize');


    program1 = initShader(vertexShaderSource, fragmentShaderSource1);

    modelUniformID1 = gl.getUniformLocation(program1, 'transform.model');
    viewProjectionUniformID1 = gl.getUniformLocation(program1, 'transform.viewProjection');
    normalUniformID1 = gl.getUniformLocation(program1, 'transform.normal');
    viewPositionUniformID1 = gl.getUniformLocation(program1, 'transform.viewPosition');

    pointLightPositionUniformID1 = gl.getUniformLocation(program1, 'pointLight.position');
    pointLightAmbientUniformID1 = gl.getUniformLocation(program1, 'pointLight.ambient');
    pointLightDiffuseUniformID1 = gl.getUniformLocation(program1, 'pointLight.diffuse');
    pointLightSpecularUniformID1 = gl.getUniformLocation(program1, 'pointLight.specular');

    textureSamplerUniformID1 = gl.getUniformLocation(program1, 'textureSampler');
    normalMapUniformID1 = gl.getUniformLocation(program1, 'normalMap');

    checkWebGLerror();
}

function draw() {
    const projection = mat4.create();
    const view = mat4.create();
    const viewProjection = mat4.create();
    let model = mat4.create();
    const normal = mat3.create();
    
    mat4.perspective(projection, 45.0 * Math.PI / 180, canvas.width / canvas.height, 0.1, 100.0);
    mat4.identity(view);
    mat4.translate(view, view, [-cameraPos[0], -cameraPos[1], -cameraPos[2]]);
    mat4.multiply(viewProjection, projection, view);

    gl.useProgram(program);

    gl.uniformMatrix4fv(viewProjectionUniformID, false, viewProjection);
    gl.uniform3f(viewPositionUniformID, -cameraPos[0], -cameraPos[1], -cameraPos[2]);

    gl.uniform4f(pointLightPositionUniformID, lightPos[0], lightPos[1], lightPos[2], lightPos[3]);
    gl.uniform4f(pointLightAmbientUniformID, 0.2, 0.2, 0.2, 1);
    gl.uniform4f(pointLightDiffuseUniformID, 1.0, 1.0, 1.0, 1);
    gl.uniform4f(pointLightSpecularUniformID, 0.8, 0.8, 0.8, 1);

    gl.uniform1i(textureSamplerUniformID, 0);
    gl.uniform1i(heightMapUniformID, 1);
    gl.uniform2f(texelSizeUniformID, 1.0 / 512, 1.0 / 512);
    

    //------------------------------------------------------------------------

    model = mat4.create();
    mat4.translate(model, model, [1, 0.0, 0.0]);
    mat4.rotate(model, model, rotation3, [0, 0, 1]);
    mat4.rotate(model, model, rotation2, [0, 1, 0]);
    mat4.rotate(model, model, rotation1, [1, 0, 0]);
    mat4.scale(model, model, [scale, scale, scale]);

    gl.uniformMatrix4fv(modelUniformID, false, model);
    mat3.normalFromMat4(normal, model);
    gl.uniformMatrix3fv(normalUniformID, false, normal);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, orangeTexture);
    
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, heightMap);

    gl.bindBuffer(gl.ARRAY_BUFFER, VBO_sphere);
    gl.enableVertexAttribArray(positionAttribID);
    gl.vertexAttribPointer(positionAttribID, 3, gl.FLOAT, false, 56, 0);
    gl.enableVertexAttribArray(texCoordAttribID);
    gl.vertexAttribPointer(texCoordAttribID, 2, gl.FLOAT, false, 56, 12);
    gl.enableVertexAttribArray(normalAttribID);
    gl.vertexAttribPointer(normalAttribID, 3, gl.FLOAT, false, 56, 20);
    gl.enableVertexAttribArray(tangentAttribID);
    gl.vertexAttribPointer(tangentAttribID, 3, gl.FLOAT, false, 56, 32);
    gl.enableVertexAttribArray(bitangentAttribID);
    gl.vertexAttribPointer(bitangentAttribID, 3, gl.FLOAT, false, 56, 44);

    gl.drawArrays(gl.TRIANGLES, 0, sphere.length / 14);

    //------------------------------------------------------------------------

    gl.useProgram(program1);

    gl.uniformMatrix4fv(viewProjectionUniformID1, false, viewProjection);
    gl.uniform3f(viewPositionUniformID1, -cameraPos[0], -cameraPos[1], -cameraPos[2]);

    gl.uniform4f(pointLightPositionUniformID1, lightPos[0], lightPos[1], lightPos[2], lightPos[3]);
    gl.uniform4f(pointLightAmbientUniformID1, 0.2, 0.2, 0.2, 1);
    gl.uniform4f(pointLightDiffuseUniformID1, 1.0, 1.0, 1.0, 1);
    gl.uniform4f(pointLightSpecularUniformID1, 0.8, 0.8, 0.8, 1);

    gl.uniform1i(textureSamplerUniformID1, 0);
    gl.uniform1i(normalMapUniformID1, 1);

    //------------------------------------------------------------------------

    model = mat4.create();
    mat4.translate(model, model, [-2, 0, 0]);
    mat4.rotate(model, model, rotation3, [0, 0, 1]);
    mat4.rotate(model, model, rotation2, [0, 1, 0]);
    mat4.rotate(model, model, rotation1, [1, 0, 0]);
    mat4.scale(model, model, [6, 6, 6]);

    gl.uniformMatrix4fv(modelUniformID1, false, model);
    mat3.normalFromMat4(normal, model);
    gl.uniformMatrix3fv(normalUniformID1, false, normal);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tilesTexture);
    
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, normalMap);

    gl.bindBuffer(gl.ARRAY_BUFFER, VBO_cube);
    gl.enableVertexAttribArray(positionAttribID);
    gl.vertexAttribPointer(positionAttribID, 3, gl.FLOAT, false, 56, 0);
    gl.enableVertexAttribArray(texCoordAttribID);
    gl.vertexAttribPointer(texCoordAttribID, 2, gl.FLOAT, false, 56, 12);
    gl.enableVertexAttribArray(normalAttribID);
    gl.vertexAttribPointer(normalAttribID, 3, gl.FLOAT, false, 56, 20);
    gl.enableVertexAttribArray(tangentAttribID);
    gl.vertexAttribPointer(tangentAttribID, 3, gl.FLOAT, false, 56, 32);
    gl.enableVertexAttribArray(bitangentAttribID);
    gl.vertexAttribPointer(bitangentAttribID, 3, gl.FLOAT, false, 56, 44);

    gl.drawArrays(gl.TRIANGLES, 0, cube.length / 14);

    //------------------------------------------------------------------------

    gl.disableVertexAttribArray(positionAttribID);
    gl.disableVertexAttribArray(texCoordAttribID);
    gl.disableVertexAttribArray(normalAttribID);
    gl.disableVertexAttribArray(tangentAttribID);
    gl.disableVertexAttribArray(bitangentAttribID);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    
    gl.bindTexture(gl.TEXTURE_2D, null);
    
    gl.useProgram(null);
    
    checkWebGLerror();
}

function handleKeyboard() {
    if (keysPressed['Digit1']) {
        rotation1 += 0.01;
    }

    if (keysPressed['Digit2']) {
       rotation2 += 0.01;
    }

    if (keysPressed['Digit3']) {
        rotation3 += 0.01;
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
    
    // First pass: build vertices with all attributes
    const vertices = [];
    faces.forEach(triangle => {
        triangle.forEach(vertex => {
            const posIdx = vertex.position;
            const texIdx = vertex.texcoord;
            const normIdx = vertex.normal;
            
            vertices.push({
                position: posIdx >= 0 ? [
                    positions[posIdx * 3],
                    positions[posIdx * 3 + 1],
                    positions[posIdx * 3 + 2]
                ] : [0, 0, 0],
                texcoord: texIdx >= 0 && texcoords.length > 0 ? [
                    texcoords[texIdx * 2],
                    texcoords[texIdx * 2 + 1]
                ] : [0, 0],
                normal: normIdx >= 0 && normals.length > 0 ? [
                    normals[normIdx * 3],
                    normals[normIdx * 3 + 1],
                    normals[normIdx * 3 + 2]
                ] : [0, 0, 1]
            });
        });
    });
    
    // Calculate tangents and bitangents for each vertex
    const vertexTangents = new Array(vertices.length).fill().map(() => [0, 0, 0]);
    const vertexBitangents = new Array(vertices.length).fill().map(() => [0, 0, 0]);
    
    // Process each triangle (3 vertices at a time)
    for (let i = 0; i < vertices.length; i += 3) {
        const v0 = vertices[i];
        const v1 = vertices[i + 1];
        const v2 = vertices[i + 2];
        
        // Get positions
        const p0 = v0.position;
        const p1 = v1.position;
        const p2 = v2.position;
        
        // Get texture coordinates
        const uv0 = v0.texcoord;
        const uv1 = v1.texcoord;
        const uv2 = v2.texcoord;
        
        // Calculate edges
        const deltaPos1 = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]];
        const deltaPos2 = [p2[0] - p0[0], p2[1] - p0[1], p2[2] - p0[2]];
        
        const deltaUV1 = [uv1[0] - uv0[0], uv1[1] - uv0[1]];
        const deltaUV2 = [uv2[0] - uv0[0], uv2[1] - uv0[1]];
        
        // Calculate tangent and bitangent
        const r = 1.0 / (deltaUV1[0] * deltaUV2[1] - deltaUV1[1] * deltaUV2[0]);
        
        const tangent = [
            (deltaPos1[0] * deltaUV2[1] - deltaPos2[0] * deltaUV1[1]) * r,
            (deltaPos1[1] * deltaUV2[1] - deltaPos2[1] * deltaUV1[1]) * r,
            (deltaPos1[2] * deltaUV2[1] - deltaPos2[2] * deltaUV1[1]) * r
        ];
        
        const bitangent = [
            (deltaPos2[0] * deltaUV1[0] - deltaPos1[0] * deltaUV2[0]) * r,
            (deltaPos2[1] * deltaUV1[0] - deltaPos1[1] * deltaUV2[0]) * r,
            (deltaPos2[2] * deltaUV1[0] - deltaPos1[2] * deltaUV2[0]) * r
        ];
        
        // Add to each vertex of the triangle
        for (let j = 0; j < 3; j++) {
            const idx = i + j;
            vertexTangents[idx][0] += tangent[0];
            vertexTangents[idx][1] += tangent[1];
            vertexTangents[idx][2] += tangent[2];
            vertexBitangents[idx][0] += bitangent[0];
            vertexBitangents[idx][1] += bitangent[1];
            vertexBitangents[idx][2] += bitangent[2];
        }
    }
    
    // Normalize tangents and orthogonalize relative to normals
    for (let i = 0; i < vertices.length; i++) {
        const normal = vertices[i].normal;
        let tangent = vertexTangents[i];
        
        // Gram-Schmidt orthogonalize tangent
        const dot = tangent[0] * normal[0] + tangent[1] * normal[1] + tangent[2] * normal[2];
        const orthogonalTangent = [
            tangent[0] - dot * normal[0],
            tangent[1] - dot * normal[1],
            tangent[2] - dot * normal[2]
        ];
        
        // Normalize tangent
        const tangentLen = Math.sqrt(orthogonalTangent[0] * orthogonalTangent[0] + 
                                      orthogonalTangent[1] * orthogonalTangent[1] + 
                                      orthogonalTangent[2] * orthogonalTangent[2]);
        if (tangentLen > 0.0001) {
            vertexTangents[i] = [
                orthogonalTangent[0] / tangentLen,
                orthogonalTangent[1] / tangentLen,
                orthogonalTangent[2] / tangentLen
            ];
        } else {
            // Fallback: create tangent perpendicular to normal
            if (Math.abs(normal[0]) < 0.999) {
                vertexTangents[i] = [1, 0, 0];
            } else {
                vertexTangents[i] = [0, 1, 0];
            }
            // Orthogonalize
            const dot2 = vertexTangents[i][0] * normal[0] + vertexTangents[i][1] * normal[1] + vertexTangents[i][2] * normal[2];
            vertexTangents[i] = [
                vertexTangents[i][0] - dot2 * normal[0],
                vertexTangents[i][1] - dot2 * normal[1],
                vertexTangents[i][2] - dot2 * normal[2]
            ];
            const len2 = Math.sqrt(vertexTangents[i][0] * vertexTangents[i][0] + 
                                   vertexTangents[i][1] * vertexTangents[i][1] + 
                                   vertexTangents[i][2] * vertexTangents[i][2]);
            vertexTangents[i] = [vertexTangents[i][0] / len2, vertexTangents[i][1] / len2, vertexTangents[i][2] / len2];
        }
        
        // Calculate bitangent as cross product of normal and tangent (for consistency)
        vertexBitangents[i] = [
            normal[1] * vertexTangents[i][2] - normal[2] * vertexTangents[i][1],
            normal[2] * vertexTangents[i][0] - normal[0] * vertexTangents[i][2],
            normal[0] * vertexTangents[i][1] - normal[1] * vertexTangents[i][0]
        ];
    }
    
    // Build final result array: position (3), texcoord (2), normal (3), tangent (3), bitangent (3)
    // Total: 14 floats per vertex
    for (let i = 0; i < vertices.length; i++) {
        const vertex = vertices[i];
        
        // Position (3 floats) - offset 0
        result.push(vertex.position[0], vertex.position[1], vertex.position[2]);
        
        // Texcoord (2 floats) - offset 3
        result.push(vertex.texcoord[0], vertex.texcoord[1]);
        
        // Normal (3 floats) - offset 5
        result.push(vertex.normal[0], vertex.normal[1], vertex.normal[2]);
        
        // Tangent (3 floats) - offset 8
        result.push(vertexTangents[i][0], vertexTangents[i][1], vertexTangents[i][2]);
        
        // Bitangent (3 floats) - offset 11
        result.push(vertexBitangents[i][0], vertexBitangents[i][1], vertexBitangents[i][2]);
    }
    
    return new Float32Array(result);
}