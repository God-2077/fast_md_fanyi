import { preservedHandle } from '../utils/preservedText';
import { translationConfig } from '../config';


const text = `
## 认证

Umami API 需要认证，可以是使用 用户的 API 密钥 或是 使用网站分享中的 API 密钥 \`x-umami-share-token\`。

\`\`\`json
{
  "username": "your-username",
  "password": "your-password"
}
\`\`\`
`;
const preservedText = preservedHandle(text, translationConfig.preservedFields, translationConfig.preservedTerms);
console.log(preservedText.text);


## 认证

Umami <PTX_moeh26pe_et7n6sbr_5> 需要认证，可以是使用 用户的 <PTX_moeh26pe_et7n6sbr_5> 密钥 或是 使用网站分享中的 <PTX_moeh26pe_et7n6sbr_5> 密钥 <PTX_moeh26pe_89anaclx_4>oeh26pe_oz2yrnrm_3>`。



<PTX_moeh26pe_2de7yji2_2>