export interface AttributeDefinition {
  category: string;
  attribute: string;
  options: string[];
}

export interface BuildProductPromptInput {
  category: string;
  styleNumber: string;
  originalName: string;
  colors: string[];
  fabricName: string;
  composition: string;
  attributes: AttributeDefinition[];
}

function formatAttributes(attributes: AttributeDefinition[]): string {
  if (attributes.length === 0) {
    return '当前类目暂无可选属性，请只根据图片和商品资料生成标题、商品名和可判断属性。';
  }

  return attributes.map((item) => `${item.attribute}: [${item.options.join(', ')}]`).join('\n');
}

export function buildProductRecognitionPrompt(input: BuildProductPromptInput): string {
  return `你是专业的大码女装抖音上架助手。
请根据商品图片和资料，一次性输出商品名、抖音主标题、副标题和属性。

商品资料：
- 款号：${input.styleNumber}
- 类目：${input.category || '未知'}
- 原始名称：${input.originalName || '无'}
- 颜色：${input.colors.join('/') || '无'}
- 面料名称：${input.fabricName || '无'}
- 成分：${input.composition || '无'}

属性选项：
${formatAttributes(input.attributes)}

规则：
1. 只输出合法 JSON，不要 Markdown，不要解释。
2. attributes 只能使用属性选项里的属性名；有选项的属性只能从选项中选择。
3. 主标题 23 到 25 个汉字，无标点、无空格、无英文数字。
4. 副标题 10 到 12 个汉字，无标点、无空格。
5. 商品名自然好记，不要包含款号。
6. 不确定的属性可以不返回，不要编造不可见细节。

输出 JSON：
{
  "productName": "",
  "title": "",
  "subtitle": "",
  "attributes": {
    "属性名": "属性值"
  }
}`;
}
